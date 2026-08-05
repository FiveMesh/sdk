import type {
  LogLevel,
  LogOptions,
  LogsEvent,
  PlayerIdentifiers,
} from "./types";

const LOG_LEVELS = new Set<LogLevel>([
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
]);
const EVENT_ID_PATTERN = /^[A-Za-z0-9:_-]{8,64}$/;
const EVENT_TYPE_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,95}$/;
const IDENTIFIER_KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
const MAX_PAST_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1_000;
const MAX_EVENT_BYTES = 16 * 1_024;

export type BuildLogEventContext = {
  eventId: string;
  environment: string;
  getIdentifiers: (playerId: string | number) => PlayerIdentifiers;
  now: Date;
  resource: string;
};

export function buildLogEvent(
  level: LogLevel,
  message: string,
  options: LogOptions,
  context: BuildLogEventContext,
): LogsEvent {
  if (!LOG_LEVELS.has(level)) {
    throw new Error("Log level must be debug, info, warn, error, or fatal.");
  }
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("Log message must be a non-empty string.");
  }
  if (message.length > 2_048) {
    throw new Error("Log message must be at most 2,048 characters.");
  }

  const eventId = options.eventId ?? context.eventId;
  if (!EVENT_ID_PATTERN.test(eventId)) {
    throw new Error(
      "Log eventId must contain 8-64 letters, digits, colons, underscores, or hyphens.",
    );
  }
  const eventType = options.eventType ?? "log";
  if (!EVENT_TYPE_PATTERN.test(eventType)) {
    throw new Error(
      "Log eventType must be lowercase and use letters, digits, dots, colons, underscores, or hyphens.",
    );
  }

  const occurredAt = options.occurredAt
    ? new Date(options.occurredAt)
    : context.now;
  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error("Log occurredAt must be a valid RFC 3339 timestamp.");
  }
  if (occurredAt.getTime() < context.now.getTime() - MAX_PAST_AGE_MS) {
    throw new Error("Log occurredAt cannot be more than seven days old.");
  }
  if (occurredAt.getTime() > context.now.getTime() + MAX_FUTURE_SKEW_MS) {
    throw new Error("Log occurredAt cannot be more than five minutes ahead.");
  }

  const resource = optionalString(
    options.resource ?? context.resource,
    "resource",
    96,
  );
  const playerId = optionalPlayerId(options.playerId, "playerId");
  const targetPlayerId = optionalPlayerId(
    options.targetPlayerId,
    "targetPlayerId",
  );
  const playerIdentifiers = mergeIdentifiers(
    playerId ? context.getIdentifiers(playerId) : undefined,
    options.playerIdentifiers,
    "playerIdentifiers",
  );
  const targetPlayerIdentifiers = mergeIdentifiers(
    targetPlayerId ? context.getIdentifiers(targetPlayerId) : undefined,
    options.targetPlayerIdentifiers,
    "targetPlayerIdentifiers",
  );
  const data = normalizeData(options.data);

  const event: LogsEvent = {
    event_id: eventId,
    event_type: eventType,
    level,
    message,
    occurred_at: occurredAt.toISOString(),
  };
  if (resource) event.resource = resource;
  if (playerId) event.player_id = playerId;
  if (targetPlayerId) event.target_player_id = targetPlayerId;
  if (playerIdentifiers) event.player_identifiers = playerIdentifiers;
  if (targetPlayerIdentifiers) {
    event.target_player_identifiers = targetPlayerIdentifiers;
  }
  const traceId = optionalString(options.traceId, "traceId", 128);
  if (traceId) event.trace_id = traceId;
  const environment = optionalString(
    options.environment ?? context.environment,
    "environment",
    64,
  );
  if (environment) event.environment = environment;
  if (data) event.data = data;

  if (Buffer.byteLength(JSON.stringify(event), "utf8") > MAX_EVENT_BYTES) {
    throw new Error("Log event exceeds the 16 KiB ingestion limit.");
  }
  return event;
}

function optionalPlayerId(
  value: string | number | undefined,
  field: string,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  return optionalString(String(value), field, 128);
}

function optionalString(
  value: string | undefined,
  field: string,
  maximumLength: number,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Log ${field} must be a non-empty string.`);
  }
  if (value.length > maximumLength) {
    throw new Error(
      `Log ${field} must be at most ${maximumLength} characters.`,
    );
  }
  return value;
}

function mergeIdentifiers(
  discovered: PlayerIdentifiers | undefined,
  explicit: PlayerIdentifiers | undefined,
  field: string,
): PlayerIdentifiers | undefined {
  if (explicit !== undefined && !isPlainObject(explicit)) {
    throw new Error(`Log ${field} must be an object.`);
  }
  const identifiers = {
    ...(discovered ?? {}),
    ...(explicit ?? {}),
  };
  const entries = Object.entries(identifiers);
  if (entries.length === 0) return undefined;
  if (entries.length > 16) {
    throw new Error(`Log ${field} cannot contain more than 16 identifiers.`);
  }
  for (const [key, value] of entries) {
    if (!IDENTIFIER_KEY_PATTERN.test(key)) {
      throw new Error(`Log ${field} contains an invalid identifier key.`);
    }
    if (
      typeof value !== "string" ||
      !value ||
      value.length > 256
    ) {
      throw new Error(
        `Log ${field}.${key} must be a non-empty string up to 256 characters.`,
      );
    }
  }
  return identifiers;
}

function normalizeData(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isPlainObject(value)) {
    throw new Error("Log data must be an object.");
  }
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    throw new Error("Log data must be JSON serializable.");
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
