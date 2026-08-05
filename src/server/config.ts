const DEFAULT_API_BASE_URL = "https://api.fivemesh.io/v1";
const DEFAULT_LOGS_BASE_URL = "https://logs.fivemesh.io";

function readConvar(name: string, fallback = ""): string {
  return GetConvar(name, fallback).trim();
}

function readBooleanConvar(name: string): boolean | null {
  const value = readConvar(name).toLowerCase();
  if (!value) return null;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  throw new Error(
    `Invalid boolean value for ${name}. Use true or false.`,
  );
}

function readIntegerConvar(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const value = readConvar(name);
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `Invalid ${name}. Use an integer between ${minimum} and ${maximum}.`,
    );
  }
  return parsed;
}

export function getApiBaseUrl(): string {
  return (
    readConvar("FIVEMESH_API_URL") ||
    readConvar("FIVEMESH_API_BASE_URL") ||
    DEFAULT_API_BASE_URL
  ).replace(/\/+$/g, "");
}

export function getApiKey(keyProfile?: string): string {
  if (keyProfile) {
    const profileConvar = `FIVEMESH_API_KEY_${keyProfile}`;
    const profileKey = readConvar(profileConvar);

    if (!profileKey) {
      throw new Error(
        `Missing FiveMesh API key profile "${keyProfile}". Add \`set ${profileConvar} fm_live_...\` to server.cfg, or remove \`keyProfile = "${keyProfile}"\` from this SDK call.`,
      );
    }

    return profileKey;
  }

  const key =
    readConvar("FIVEMESH_API_KEY") ||
    readConvar("FIVEMESH_CDN_API_KEY") ||
    readConvar("FIVEMESH_SERVICE_API_KEY") ||
    readConvar("FIVEMESH_LOGS_API_KEY");

  if (!key) {
    throw new Error(
      "Missing FiveMesh API key. Add `set FIVEMESH_API_KEY fm_live_...` to server.cfg.",
    );
  }

  return key;
}

export function assertRequiredConfig(): void {
  if (readConvar("FIVEMESH_LOGS_QUERY_API_KEY")) {
    if (
      getAutomaticLoggingEnabled() ||
      getBaseEventsLoggingEnabled() ||
      getOxInventoryLoggingEnabled() ||
      getTxAdminLoggingEnabled()
    ) {
      assertLogsWriteConfig();
    }
    return;
  }
  getApiKey();
}

export function getDebugEnabled(): boolean {
  return ["1", "true", "yes", "on"].includes(
    readConvar("FIVEMESH_SDK_DEBUG").toLowerCase(),
  );
}

export function getBearerToken(keyProfile?: string): string {
  const key = getApiKey(keyProfile);
  return key.toLowerCase().startsWith("bearer ") ? key : `Bearer ${key}`;
}

export function getLogsBearerToken(): string {
  const key = readConvar("FIVEMESH_LOGS_API_KEY") || getApiKey();
  return key.toLowerCase().startsWith("bearer ") ? key : `Bearer ${key}`;
}

export function assertLogsWriteConfig(): void {
  try {
    getLogsBearerToken();
  } catch {
    throw new Error(
      "Automatic FiveMesh Logs ingestion requires `FIVEMESH_LOGS_API_KEY` with `logs:write`, or a compatible `FIVEMESH_API_KEY`.",
    );
  }
}

export function getLogsQueryBearerToken(keyProfile?: string): string {
  if (keyProfile) return getBearerToken(keyProfile);

  const key =
    readConvar("FIVEMESH_LOGS_QUERY_API_KEY") ||
    readConvar("FIVEMESH_LOGS_API_KEY") ||
    getApiKey();
  return key.toLowerCase().startsWith("bearer ") ? key : `Bearer ${key}`;
}

export function getLogsBaseUrl(): string {
  return (
    readConvar("FIVEMESH_LOGS_API_URL") || DEFAULT_LOGS_BASE_URL
  ).replace(/\/+$/g, "");
}

export function getLogsServerId(): string {
  const serverId =
    readConvar("FIVEMESH_SERVER_ID") ||
    readConvar("FIVEMESH_LOGS_SERVER_ID");

  if (!serverId) {
    throw new Error(
      "Missing FiveMesh server ID. Add `set FIVEMESH_SERVER_ID your-cfx-server-id` to server.cfg.",
    );
  }
  if (!/^[A-Za-z0-9-]{3,64}$/.test(serverId)) {
    throw new Error(
      "Invalid FiveMesh server ID. Use the connected cfx.re server ID shown in the FiveMesh Logs dashboard.",
    );
  }
  return serverId;
}

export function getLogsEnvironment(): string {
  return readConvar("FIVEMESH_LOGS_ENVIRONMENT", "production");
}

export function getAutomaticLoggingEnabled(): boolean {
  return (
    readBooleanConvar("FIVEMESH_LOGS_AUTOMATIC") ??
    readBooleanConvar("ENABLE_AUTOMATIC_LOGGING") ??
    false
  );
}

export function getOxInventoryLoggingEnabled(): boolean {
  return (
    readBooleanConvar("FIVEMESH_LOGS_OX_INVENTORY") ??
    getAutomaticLoggingEnabled()
  );
}

export function getBaseEventsLoggingEnabled(): boolean {
  return (
    readBooleanConvar("FIVEMESH_LOGS_BASEEVENTS") ??
    getAutomaticLoggingEnabled()
  );
}

export function getTxAdminLoggingEnabled(): boolean {
  return (
    readBooleanConvar("FIVEMESH_LOGS_TXADMIN") ??
    getAutomaticLoggingEnabled()
  );
}

export function getLogsBatchSize(): number {
  return readIntegerConvar("FIVEMESH_LOGS_BATCH_SIZE", 50, 1, 50);
}

export function getLogsFlushIntervalMs(): number {
  return readIntegerConvar(
    "FIVEMESH_LOGS_FLUSH_INTERVAL",
    5_000,
    1_000,
    60_000,
  );
}

export function getExcludedPlayerIdentifiers(): Set<string> {
  return new Set(
    readConvar("FIVEMESH_LOGS_EXCLUDED_IDENTIFIERS")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
}
