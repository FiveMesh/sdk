import { randomUUID } from "node:crypto";

import {
  assertLogsWriteConfig,
  getAutomaticLoggingEnabled,
  getBaseEventsLoggingEnabled,
  getLogsBatchSize,
  getLogsEnvironment,
  getLogsFlushIntervalMs,
  getLogsServerId,
  getOxInventoryLoggingEnabled,
} from "../config";
import { startAutomaticLogging } from "./automatic";
import { buildLogEvent } from "./event";
import {
  getPlayerIdentifiers,
  registerIdentifierLifecycle,
} from "./identifiers";
import { startOxInventoryLogging } from "./ox-inventory";
import { LogsTransport } from "./transport";
import type {
  FlushLogsResponse,
  LogLevel,
  LogOptions,
  QueueLogResponse,
} from "./types";

let transport: LogsTransport | null = null;
let started = false;

export function queueLog(
  level: LogLevel,
  message: string,
  options: LogOptions = {},
): QueueLogResponse {
  if (!isRecord(options)) {
    throw new Error("Log options must be an object.");
  }

  getLogsServerId();
  const activeTransport = getTransport();
  const event = buildLogEvent(level, message, options, {
    eventId: randomUUID(),
    environment: getLogsEnvironment(),
    getIdentifiers: getPlayerIdentifiers,
    now: new Date(),
    resource:
      options.resource ||
      GetInvokingResource() ||
      GetCurrentResourceName(),
  });
  const pendingEvents = activeTransport.enqueue(event);
  return {
    success: true,
    queued: true,
    eventId: event.event_id,
    pendingEvents,
  };
}

export function debug(
  message: string,
  options: LogOptions = {},
): QueueLogResponse {
  return queueLog("debug", message, options);
}

export function info(
  message: string,
  options: LogOptions = {},
): QueueLogResponse {
  return queueLog("info", message, options);
}

export function warn(
  message: string,
  options: LogOptions = {},
): QueueLogResponse {
  return queueLog("warn", message, options);
}

export function error(
  message: string,
  options: LogOptions = {},
): QueueLogResponse {
  return queueLog("error", message, options);
}

export function fatal(
  message: string,
  options: LogOptions = {},
): QueueLogResponse {
  return queueLog("fatal", message, options);
}

export function flushLogs(): Promise<FlushLogsResponse> {
  return getTransport().flush();
}

export function startLogsFeature(): void {
  if (started) return;

  const automatic = getAutomaticLoggingEnabled();
  const baseEvents = getBaseEventsLoggingEnabled();
  const oxInventory = getOxInventoryLoggingEnabled();
  if (automatic || baseEvents || oxInventory) {
    assertLogsWriteConfig();
    getLogsServerId();
  }

  started = true;
  registerIdentifierLifecycle();

  if (automatic || baseEvents || oxInventory) {
    getTransport().start();
  }

  const writeAutomatic = (
    level: LogLevel,
    message: string,
    options: LogOptions,
  ) => {
    try {
      queueLog(level, message, options);
    } catch (logError) {
      console.error(
        `[FiveMesh SDK] Automatic log "${options.eventType ?? "log"}" was skipped: ${getErrorMessage(logError)}`,
      );
    }
  };

  if (automatic || baseEvents) {
    startAutomaticLogging(writeAutomatic, {
      baseEvents,
      core: automatic,
    });
  }
  if (oxInventory) {
    startOxInventoryLogging(writeAutomatic);
  }

  on("onResourceStop", (resourceName: string) => {
    if (resourceName !== GetCurrentResourceName() || !transport) return;
    void transport.close().catch((closeError) => {
      console.error(
        `[FiveMesh SDK] Final Logs flush failed: ${getErrorMessage(closeError)}`,
      );
    });
  });

  if (automatic || baseEvents || oxInventory) {
    console.log(
      `[FiveMesh SDK] Logs ready. Automatic: ${automatic ? "on" : "off"}; baseevents: ${baseEvents ? "on" : "off"}; ox_inventory: ${oxInventory ? "on" : "off"}.`,
    );
  }
}

function getTransport(): LogsTransport {
  transport ??= new LogsTransport({
    batchSize: getLogsBatchSize(),
    flushIntervalMs: getLogsFlushIntervalMs(),
  });
  return transport;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(logError: unknown): string {
  return logError instanceof Error ? logError.message : String(logError);
}
