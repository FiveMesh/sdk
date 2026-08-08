import type { ApiEnvelope } from "../../shared/types";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
export type PlayerIdentifiers = Record<string, string>;

export type LogOptions = {
  data?: Record<string, unknown>;
  environment?: string;
  eventId?: string;
  eventType?: string;
  occurredAt?: string;
  playerId?: string | number;
  playerIdentifiers?: PlayerIdentifiers;
  resource?: string;
  targetPlayerId?: string | number;
  targetPlayerIdentifiers?: PlayerIdentifiers;
  traceId?: string;
};

export type LogsEvent = {
  level: LogLevel;
  message: string;
  event_id: string;
  event_type: string;
  occurred_at: string;
  resource?: string;
  player_id?: string;
  target_player_id?: string;
  player_identifiers?: PlayerIdentifiers;
  target_player_identifiers?: PlayerIdentifiers;
  trace_id?: string;
  environment?: string;
  data?: Record<string, unknown>;
};

export type QueueLogResponse = ApiEnvelope & {
  success: true;
  queued: true;
  eventId: string;
  pendingEvents: number;
};

export type FlushLogsResponse = ApiEnvelope & {
  success: true;
  acceptedEvents: number;
  batches: number;
  pendingEvents: number;
};

export type LogsIngestionResponse = {
  accepted?: boolean;
  batch_id?: string;
  accepted_events?: number;
  ingested_at?: string;
  error?: string;
  message?: string;
  request_id?: string;
};
