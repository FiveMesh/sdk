import type {
  QueryLogsOptions,
  QueryLogsResponse,
} from "../../shared/types";
import {
  getApiBaseUrl,
  getLogsQueryBearerToken,
  getLogsServerId,
} from "../config";
import { requestJson } from "../http";

const DEFAULT_LOOKBACK_MINUTES = 6 * 60;
const MAX_LOOKBACK_MINUTES = 7 * 24 * 60;

export type LogsQueryRequestBody = {
  serverId: string;
  from: string;
  to: string;
  level?: QueryLogsOptions["level"];
  eventType?: string;
  resource?: string;
  message?: string;
  playerId?: string;
  identifier?: QueryLogsOptions["identifier"];
  cursor?: string;
  limit: number;
};

export function buildLogsQueryRequest(
  options: QueryLogsOptions,
  context: { now: Date; serverId: string },
): LogsQueryRequestBody {
  const serverId = (options.serverId ?? context.serverId).trim().toLowerCase();
  if (!/^[a-z0-9-]{3,64}$/.test(serverId)) {
    throw new Error("A valid FiveMesh CFX server ID is required.");
  }

  if (options.from && options.lookbackMinutes !== undefined) {
    throw new Error("Use either from or lookbackMinutes, not both.");
  }

  const to = parseQueryDate(options.to, "to", context.now);
  const lookbackMinutes =
    options.lookbackMinutes ?? DEFAULT_LOOKBACK_MINUTES;
  if (
    !Number.isInteger(lookbackMinutes) ||
    lookbackMinutes < 1 ||
    lookbackMinutes > MAX_LOOKBACK_MINUTES
  ) {
    throw new Error(
      `lookbackMinutes must be an integer between 1 and ${MAX_LOOKBACK_MINUTES}.`,
    );
  }
  const from = options.from
    ? parseQueryDate(options.from, "from")
    : new Date(to.getTime() - lookbackMinutes * 60 * 1_000);
  if (from > to) {
    throw new Error("The FiveMesh Logs query time range is invalid.");
  }
  if (to.getTime() - from.getTime() > MAX_LOOKBACK_MINUTES * 60 * 1_000) {
    throw new Error("FiveMesh Logs queries may span at most seven days.");
  }

  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("limit must be an integer between 1 and 100.");
  }

  const request: LogsQueryRequestBody = {
    serverId,
    from: from.toISOString(),
    to: to.toISOString(),
    limit,
  };
  const level = options.level ?? undefined;
  const eventType = optionalString(options.eventType);
  const resource = optionalString(options.resource);
  const message = optionalString(options.message);
  const playerId =
    options.playerId == null
      ? undefined
      : optionalString(String(options.playerId));
  const identifier = options.identifier ?? undefined;
  const cursor = optionalString(options.cursor);

  if (level) request.level = level;
  if (eventType) request.eventType = eventType;
  if (resource) request.resource = resource;
  if (message) request.message = message;
  if (playerId) request.playerId = playerId;
  if (identifier) request.identifier = identifier;
  if (cursor) request.cursor = cursor;
  return request;
}

export function queryLogs(
  options: QueryLogsOptions = {},
): Promise<QueryLogsResponse> {
  const { keyProfile } = options;
  const body = buildLogsQueryRequest(options, {
    now: new Date(),
    serverId: getLogsServerId(),
  });

  return requestJson<QueryLogsResponse>(getApiBaseUrl(), "/logs/query", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    authorization: getLogsQueryBearerToken(keyProfile),
    timeoutMs: 30_000,
  });
}

function parseQueryDate(
  value: string | undefined,
  label: string,
  fallback?: Date,
): Date {
  const date = value ? new Date(value) : fallback;
  if (!date || Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid RFC 3339 timestamp.`);
  }
  return date;
}

function optionalString(
  value: string | null | undefined,
): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
