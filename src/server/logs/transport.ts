import { randomUUID } from "node:crypto";

import {
  getLogsBearerToken,
  getLogsBaseUrl,
  getLogsServerId,
} from "../config";
import type {
  FlushLogsResponse,
  LogsEvent,
  LogsIngestionResponse,
} from "./types";

const MAX_PENDING_EVENTS = 2_000;
const REQUEST_TIMEOUT_MS = 180_000;
const DEFAULT_IN_PROGRESS_RETRY_MS = 5_000;
const MAX_RETRY_AFTER_MS = 30_000;

export type LogsBatch = {
  batchId: string;
  events: LogsEvent[];
};

export type LogsTransportOptions = {
  batchSize: number;
  flushIntervalMs: number;
  sendBatch?: (batch: LogsBatch) => Promise<number>;
};

export class LogsTransportError extends Error {
  code: string;
  details?: unknown;
  requestId?: string;
  retryAfterMs?: number;
  retryable: boolean;
  status?: number;

  constructor(input: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
    retryAfterMs?: number;
    retryable: boolean;
    status?: number;
  }) {
    super(input.message);
    this.name = "LogsTransportError";
    this.code = input.code;
    this.details = input.details;
    this.requestId = input.requestId;
    this.retryAfterMs = input.retryAfterMs;
    this.retryable = input.retryable;
    this.status = input.status;
  }
}

export class LogsTransport {
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly sendBatch: (batch: LogsBatch) => Promise<number>;
  private flushPromise?: Promise<FlushLogsResponse>;
  private interval?: ReturnType<typeof setInterval>;
  private pending: LogsEvent[] = [];
  private retryBatch?: LogsBatch;
  private lastReportedFailure = "";
  private lastReportedFailureAt = 0;

  constructor(options: LogsTransportOptions) {
    this.batchSize = options.batchSize;
    this.flushIntervalMs = options.flushIntervalMs;
    this.sendBatch = options.sendBatch ?? sendLogsBatch;
  }

  enqueue(event: LogsEvent): number {
    if (this.pendingEvents >= MAX_PENDING_EVENTS) {
      throw new Error(
        `FiveMesh Logs queue is full (${MAX_PENDING_EVENTS} events).`,
      );
    }

    this.pending.push(event);
    this.start();
    if (this.pending.length >= this.batchSize) {
      this.flushInBackground();
    }
    return this.pending.length;
  }

  get pendingEvents(): number {
    return this.pending.length + (this.retryBatch?.events.length ?? 0);
  }

  start(): void {
    if (this.interval) return;
    this.interval = setInterval(() => {
      if (this.pendingEvents > 0) this.flushInBackground();
    }, this.flushIntervalMs);
  }

  async flush(): Promise<FlushLogsResponse> {
    if (this.flushPromise) return this.flushPromise;

    this.flushPromise = this.flushPending();
    try {
      return await this.flushPromise;
    } finally {
      this.flushPromise = undefined;
    }
  }

  async close(): Promise<FlushLogsResponse> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    return this.flush();
  }

  private flushInBackground(): void {
    void this.flush().catch((error) => this.reportFailure(error));
  }

  private async flushPending(): Promise<FlushLogsResponse> {
    let acceptedEvents = 0;
    let batches = 0;

    while (this.retryBatch || this.pending.length > 0) {
      const batch =
        this.retryBatch ??
        {
          batchId: `batch_${randomUUID()}`,
          events: this.pending.splice(0, this.batchSize),
        };
      this.retryBatch = batch;
      try {
        const accepted = await this.sendBatch(batch);
        this.retryBatch = undefined;
        acceptedEvents += accepted;
        batches += 1;
      } catch (error) {
        if (
          error instanceof LogsTransportError &&
          error.retryable &&
          (error.code === "batch_in_progress" ||
            error.code === "LOGS_REQUEST_TIMEOUT")
        ) {
          await delay(error.retryAfterMs ?? DEFAULT_IN_PROGRESS_RETRY_MS);
          continue;
        }
        if (!(error instanceof LogsTransportError && error.retryable)) {
          this.retryBatch = undefined;
        }
        throw error;
      }
    }

    return {
      success: true,
      acceptedEvents,
      batches,
      pendingEvents: this.pending.length,
    };
  }

  private reportFailure(error: unknown): void {
    const message = getErrorMessage(error);
    const now = Date.now();
    if (
      message === this.lastReportedFailure &&
      now - this.lastReportedFailureAt < 30_000
    ) {
      return;
    }
    this.lastReportedFailure = message;
    this.lastReportedFailureAt = now;
    console.error(
      `[FiveMesh SDK] Logs batch failed: ${message}. Pending events: ${this.pendingEvents}.`,
    );
  }
}

async function sendLogsBatch(batch: LogsBatch): Promise<number> {
  const serverId = getLogsServerId();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch(
      `${getLogsBaseUrl()}/v1/servers/${encodeURIComponent(serverId)}/logs`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: getLogsBearerToken(),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          batch_id: batch.batchId,
          events: batch.events,
        }),
        signal: controller.signal,
      },
    );
  } catch (error) {
    const timedOut = controller.signal.aborted;
    throw new LogsTransportError({
      code: timedOut ? "LOGS_REQUEST_TIMEOUT" : "LOGS_NETWORK_ERROR",
      message: timedOut
        ? `FiveMesh Logs acknowledgement timed out after ${REQUEST_TIMEOUT_MS}ms; the batch will be reconciled automatically.`
        : `FiveMesh Logs request failed: ${getErrorMessage(error)}`,
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
  }

  const requestId = response.headers.get("x-request-id") ?? undefined;
  const payload = (await response
    .json()
    .catch(() => null)) as LogsIngestionResponse | null;
  if (
    response.status !== 202 ||
    !payload?.accepted ||
    payload.accepted_events !== batch.events.length
  ) {
    throw new LogsTransportError({
      code: payload?.error ?? "LOGS_INGESTION_FAILED",
      message:
        payload?.message ??
        `FiveMesh Logs ingestion failed with HTTP ${response.status}.`,
      details: payload,
      requestId: payload?.request_id ?? requestId,
      retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      retryable: response.status === 429 || response.status >= 500,
      status: response.status,
    });
  }

  return payload.accepted_events;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;

  const seconds = Number(value);
  const milliseconds = Number.isFinite(seconds)
    ? seconds * 1_000
    : Date.parse(value) - Date.now();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return undefined;
  return Math.min(milliseconds, MAX_RETRY_AFTER_MS);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
