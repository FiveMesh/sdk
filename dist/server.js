"use strict";

// src/server/config.ts
var DEFAULT_API_BASE_URL = "https://api.fivemesh.io/v1";
var DEFAULT_LOGS_BASE_URL = "https://logs.fivemesh.io";
function readConvar(name, fallback = "") {
  return GetConvar(name, fallback).trim();
}
function readBooleanConvar(name) {
  const value = readConvar(name).toLowerCase();
  if (!value) return null;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  throw new Error(
    `Invalid boolean value for ${name}. Use true or false.`
  );
}
function readIntegerConvar(name, fallback, minimum, maximum) {
  const value = readConvar(name);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `Invalid ${name}. Use an integer between ${minimum} and ${maximum}.`
    );
  }
  return parsed;
}
function getApiBaseUrl() {
  return (readConvar("FIVEMESH_API_URL") || readConvar("FIVEMESH_API_BASE_URL") || DEFAULT_API_BASE_URL).replace(/\/+$/g, "");
}
function getApiKey(keyProfile) {
  if (keyProfile) {
    const profileConvar = `FIVEMESH_API_KEY_${keyProfile}`;
    const profileKey = readConvar(profileConvar);
    if (!profileKey) {
      throw new Error(
        `Missing FiveMesh API key profile "${keyProfile}". Add \`set ${profileConvar} fm_live_...\` to server.cfg, or remove \`keyProfile = "${keyProfile}"\` from this SDK call.`
      );
    }
    return profileKey;
  }
  const key = readConvar("FIVEMESH_API_KEY") || readConvar("FIVEMESH_CDN_API_KEY") || readConvar("FIVEMESH_SERVICE_API_KEY") || readConvar("FIVEMESH_LOGS_API_KEY");
  if (!key) {
    throw new Error(
      "Missing FiveMesh API key. Add `set FIVEMESH_API_KEY fm_live_...` to server.cfg."
    );
  }
  return key;
}
function assertRequiredConfig() {
  if (readConvar("FIVEMESH_LOGS_QUERY_API_KEY")) {
    if (getAutomaticLoggingEnabled() || getBaseEventsLoggingEnabled() || getOxInventoryLoggingEnabled() || getTxAdminLoggingEnabled()) {
      assertLogsWriteConfig();
    }
    return;
  }
  getApiKey();
}
function getDebugEnabled() {
  return ["1", "true", "yes", "on"].includes(
    readConvar("FIVEMESH_SDK_DEBUG").toLowerCase()
  );
}
function getBearerToken(keyProfile) {
  const key = getApiKey(keyProfile);
  return key.toLowerCase().startsWith("bearer ") ? key : `Bearer ${key}`;
}
function getLogsBearerToken() {
  const key = readConvar("FIVEMESH_LOGS_API_KEY") || getApiKey();
  return key.toLowerCase().startsWith("bearer ") ? key : `Bearer ${key}`;
}
function assertLogsWriteConfig() {
  try {
    getLogsBearerToken();
  } catch {
    throw new Error(
      "Automatic FiveMesh Logs ingestion requires `FIVEMESH_LOGS_API_KEY` with `logs:write`, or a compatible `FIVEMESH_API_KEY`."
    );
  }
}
function getLogsQueryBearerToken(keyProfile) {
  if (keyProfile) return getBearerToken(keyProfile);
  const key = readConvar("FIVEMESH_LOGS_QUERY_API_KEY") || readConvar("FIVEMESH_LOGS_API_KEY") || getApiKey();
  return key.toLowerCase().startsWith("bearer ") ? key : `Bearer ${key}`;
}
function getLogsBaseUrl() {
  return (readConvar("FIVEMESH_LOGS_API_URL") || DEFAULT_LOGS_BASE_URL).replace(/\/+$/g, "");
}
function getLogsServerId() {
  const serverId = readConvar("FIVEMESH_SERVER_ID") || readConvar("FIVEMESH_LOGS_SERVER_ID");
  if (!serverId) {
    throw new Error(
      "Missing FiveMesh server ID. Add `set FIVEMESH_SERVER_ID your-cfx-server-id` to server.cfg."
    );
  }
  if (!/^[A-Za-z0-9-]{3,64}$/.test(serverId)) {
    throw new Error(
      "Invalid FiveMesh server ID. Use the connected cfx.re server ID shown in the FiveMesh Logs dashboard."
    );
  }
  return serverId;
}
function getLogsEnvironment() {
  return readConvar("FIVEMESH_LOGS_ENVIRONMENT", "production");
}
function getAutomaticLoggingEnabled() {
  return readBooleanConvar("FIVEMESH_LOGS_AUTOMATIC") ?? readBooleanConvar("ENABLE_AUTOMATIC_LOGGING") ?? false;
}
function getOxInventoryLoggingEnabled() {
  return readBooleanConvar("FIVEMESH_LOGS_OX_INVENTORY") ?? getAutomaticLoggingEnabled();
}
function getBaseEventsLoggingEnabled() {
  return readBooleanConvar("FIVEMESH_LOGS_BASEEVENTS") ?? getAutomaticLoggingEnabled();
}
function getTxAdminLoggingEnabled() {
  return readBooleanConvar("FIVEMESH_LOGS_TXADMIN") ?? getAutomaticLoggingEnabled();
}
function getLogsBatchSize() {
  return readIntegerConvar("FIVEMESH_LOGS_BATCH_SIZE", 50, 1, 50);
}
function getLogsFlushIntervalMs() {
  return readIntegerConvar(
    "FIVEMESH_LOGS_FLUSH_INTERVAL",
    5e3,
    1e3,
    6e4
  );
}
function getExcludedPlayerIdentifiers() {
  return new Set(
    readConvar("FIVEMESH_LOGS_EXCLUDED_IDENTIFIERS").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean)
  );
}

// src/server/files.ts
function containsBinaryCodeUnits(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0 || code > 127) return true;
  }
  return false;
}
function parseStringInput(value, encoding) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(value);
  if (!match) {
    const resolvedEncoding = encoding ?? (containsBinaryCodeUnits(value) ? "binary" : "utf8");
    return {
      bytes: Buffer.from(
        value,
        resolvedEncoding === "binary" ? "latin1" : resolvedEncoding
      )
    };
  }
  const [, contentType, base64Flag, body] = match;
  return {
    bytes: Buffer.from(decodeURIComponent(body ?? ""), base64Flag ? "base64" : "utf8"),
    contentType
  };
}
function toBlobFile(input, options = {}) {
  if (input instanceof Blob) {
    return {
      blob: input,
      filename: options.filename ?? "file"
    };
  }
  if (typeof input === "string") {
    const parsed = parseStringInput(input, options.dataEncoding);
    return {
      blob: new Blob([new Uint8Array(parsed.bytes)], {
        type: options.contentType ?? parsed.contentType ?? "application/octet-stream"
      }),
      filename: options.filename ?? "file"
    };
  }
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  return {
    blob: new Blob([arrayBuffer], {
      type: options.contentType ?? "application/octet-stream"
    }),
    filename: options.filename ?? "file"
  };
}
function appendMetadata(form, metadata) {
  if (metadata && Object.keys(metadata).length > 0) {
    form.append("metadata", JSON.stringify(metadata));
  }
}

// src/shared/errors.ts
function getErrorMessage(error2) {
  if (error2 instanceof Error) return error2.message;
  if (typeof error2 === "string") return error2;
  try {
    return JSON.stringify(error2);
  } catch {
    return "Unknown error";
  }
}
var FiveMeshApiError = class extends Error {
  code;
  status;
  requestId;
  details;
  constructor(input) {
    super(input.message);
    this.name = "FiveMeshApiError";
    this.code = input.code;
    this.status = input.status;
    this.requestId = input.requestId;
    this.details = input.details;
  }
};

// src/server/http.ts
function buildUrl(baseUrl, path, query) {
  const suffix = path === "" ? "" : path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${baseUrl}${suffix}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}
async function requestJson(baseUrl, path, options = {}) {
  const headers = {
    accept: "application/json",
    ...options.headers
  };
  if (options.authenticated !== false) {
    headers.authorization = options.authorization ?? getBearerToken(options.keyProfile);
  }
  const controller = options.timeoutMs === void 0 ? void 0 : new AbortController();
  const timeout = controller === void 0 ? void 0 : setTimeout(() => controller.abort(), options.timeoutMs);
  let response;
  try {
    response = await fetch(buildUrl(baseUrl, path, options.query), {
      method: options.method ?? "GET",
      headers,
      body: options.body,
      signal: controller == null ? void 0 : controller.signal
    });
  } finally {
    if (timeout !== void 0) clearTimeout(timeout);
  }
  const requestId = response.headers.get("x-request-id") ?? void 0;
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || !(payload == null ? void 0 : payload.success)) {
    const apiError = payload == null ? void 0 : payload.error;
    throw new FiveMeshApiError({
      code: (apiError == null ? void 0 : apiError.code) ?? "REQUEST_FAILED",
      message: (apiError == null ? void 0 : apiError.message) ?? `FiveMesh API request failed with HTTP ${response.status}.`,
      status: response.status,
      requestId: (payload == null ? void 0 : payload.requestId) ?? requestId,
      details: apiError == null ? void 0 : apiError.details
    });
  }
  return payload;
}

// src/server/api.ts
function idempotencyHeaders(idempotencyKey) {
  return idempotencyKey ? { "idempotency-key": idempotencyKey } : {};
}
function listObjects(options = {}) {
  const { keyProfile, ...query } = options;
  return requestJson(getApiBaseUrl(), "/objects", {
    query,
    keyProfile
  });
}
function uploadFile(data, options = {}) {
  const file = toBlobFile(data, {
    filename: options.filename,
    contentType: options.contentType,
    dataEncoding: options.dataEncoding
  });
  const form = new FormData();
  form.append("file", file.blob, file.filename);
  if (options.filename) form.append("filename", options.filename);
  if (options.path) form.append("path", options.path);
  appendMetadata(form, options.metadata);
  return requestJson(getApiBaseUrl(), "/objects", {
    method: "POST",
    body: form,
    headers: idempotencyHeaders(options.idempotencyKey),
    keyProfile: options.keyProfile
  });
}
function uploadImage(data, metadata, options = {}) {
  return uploadFile(data, {
    filename: options.filename ?? "image.webp",
    ...options,
    metadata: metadata ?? options.metadata
  });
}
function bulkUpload(items, options = {}) {
  const form = new FormData();
  const payload = {
    items: items.map((item, index) => {
      const fieldName = `files[${index}]`;
      const file = toBlobFile(item.data, {
        filename: item.filename,
        contentType: item.contentType,
        dataEncoding: item.dataEncoding
      });
      form.append(fieldName, file.blob, file.filename);
      return {
        fieldName,
        filename: item.filename,
        path: item.path,
        metadata: item.metadata
      };
    })
  };
  form.append("payload", JSON.stringify(payload));
  return requestJson(getApiBaseUrl(), "/objects/bulk", {
    method: "POST",
    body: form,
    headers: idempotencyHeaders(options.idempotencyKey),
    keyProfile: options.keyProfile
  });
}
function deleteObject(path, options = {}) {
  return requestJson(getApiBaseUrl(), "/objects", {
    method: "DELETE",
    query: { path },
    headers: idempotencyHeaders(options.idempotencyKey),
    keyProfile: options.keyProfile
  });
}
function bulkDelete(paths, options = {}) {
  return requestJson(getApiBaseUrl(), "/objects/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ paths }),
    headers: { "content-type": "application/json" },
    keyProfile: options.keyProfile
  });
}
function purgeObjects(paths, options = {}) {
  return requestJson(getApiBaseUrl(), "/objects/purge", {
    method: "POST",
    body: JSON.stringify({ paths }),
    headers: {
      "content-type": "application/json",
      ...idempotencyHeaders(options.idempotencyKey)
    },
    keyProfile: options.keyProfile
  });
}
function createPresignedUrl(options = {}) {
  const { keyProfile, ...query } = options;
  return requestJson(getApiBaseUrl(), "/presigned-url", {
    query,
    keyProfile
  });
}
function uploadWithPresignedUrl(uploadUrlOrToken, data, options = {}) {
  const file = toBlobFile(data, {
    filename: options.filename,
    contentType: options.contentType,
    dataEncoding: options.dataEncoding
  });
  const form = new FormData();
  form.append("file", file.blob, file.filename);
  if (options.filename) form.append("filename", options.filename);
  if (options.path) form.append("path", options.path);
  appendMetadata(form, options.metadata);
  const url = uploadUrlOrToken.startsWith("http") ? uploadUrlOrToken : `${getApiBaseUrl()}/presigned-url/${uploadUrlOrToken}`;
  return requestJson(url, "", {
    method: "POST",
    body: form,
    authenticated: false
  });
}

// src/server/logs/logger.ts
var import_node_crypto2 = require("node:crypto");

// src/server/logs/automatic.ts
var coreRegistered = false;
var baseEventsRegistered = false;
var BASE_EVENT_MIN_INTERVAL_MS = 5e3;
var baseEventThrottle = createAutomaticEventThrottle(
  BASE_EVENT_MIN_INTERVAL_MS
);
function createAutomaticEventThrottle(minimumIntervalMs) {
  const lastAcceptedAt = /* @__PURE__ */ new Map();
  return {
    accept(playerId2, now = Date.now()) {
      const previous = lastAcceptedAt.get(playerId2);
      if (previous !== void 0 && now - previous < Math.max(0, minimumIntervalMs)) {
        return false;
      }
      lastAcceptedAt.set(playerId2, now);
      return true;
    },
    clear(playerId2) {
      lastAcceptedAt.delete(playerId2);
    }
  };
}
function startAutomaticLogging(write, options) {
  if (options.core && !coreRegistered) {
    coreRegistered = true;
    registerCoreEvents(write);
  }
  if (options.baseEvents && !baseEventsRegistered) {
    baseEventsRegistered = true;
    registerBaseEvents(write);
  }
}
function registerCoreEvents(write) {
  on("playerConnecting", (playerName) => {
    const playerId2 = String(global.source);
    write("info", `Player ${playerName} is connecting`, {
      eventType: "player.connecting",
      playerId: playerId2,
      resource: "fivem",
      data: {
        player_name: playerName
      }
    });
  });
  on("playerJoining", (oldPlayerId) => {
    const playerId2 = String(global.source);
    const playerName = GetPlayerName(playerId2) || "Unknown";
    write("info", `Player ${playerName} joined`, {
      eventType: "player.joined",
      playerId: playerId2,
      resource: "fivem",
      data: {
        player_name: playerName,
        previous_player_id: oldPlayerId
      }
    });
  });
  on(
    "playerDropped",
    (reason, resourceName, clientDropReason) => {
      const playerId2 = String(global.source);
      const playerName = GetPlayerName(playerId2) || "Unknown";
      write("info", `Player ${playerName} disconnected`, {
        eventType: "player.disconnected",
        playerId: playerId2,
        resource: "fivem",
        data: {
          player_name: playerName,
          reason,
          resource_name: resourceName,
          client_drop_reason: clientDropReason
        }
      });
    }
  );
}
function registerBaseEvents(write) {
  on("playerDropped", () => {
    baseEventThrottle.clear(String(global.source));
  });
  on(
    "baseevents:onPlayerDied",
    (killerType, deathCoordinates) => {
      const playerId2 = String(global.source);
      if (!baseEventThrottle.accept(playerId2)) return;
      const playerName = GetPlayerName(playerId2) || "Unknown";
      write("info", `Player ${playerName} died`, {
        eventType: "player.died",
        playerId: playerId2,
        resource: "baseevents",
        data: {
          event_trust: "client_reported",
          player_name: playerName,
          killer_type: killerType,
          death_coordinates: compactJsonValue(deathCoordinates)
        }
      });
    }
  );
  on(
    "baseevents:onPlayerKilled",
    (killerId, deathData) => {
      const victimId = String(global.source);
      if (!baseEventThrottle.accept(victimId)) return;
      const killerPlayerId = Number.isInteger(killerId) && killerId >= 0 ? String(killerId) : void 0;
      const victimName = GetPlayerName(victimId) || "Unknown";
      const killerName = killerPlayerId ? GetPlayerName(killerPlayerId) || "Unknown" : "Unknown";
      write("info", `Player ${victimName} was killed by ${killerName}`, {
        eventType: "player.killed",
        playerId: killerPlayerId ?? victimId,
        targetPlayerId: killerPlayerId ? victimId : void 0,
        resource: "baseevents",
        data: {
          event_trust: "client_reported",
          victim_name: victimName,
          killer_name: killerName,
          killer_type: deathData == null ? void 0 : deathData.killertype,
          weapon_hash: deathData == null ? void 0 : deathData.weaponhash,
          killer_in_vehicle: deathData == null ? void 0 : deathData.killerinveh,
          killer_vehicle_name: deathData == null ? void 0 : deathData.killervehname,
          killer_vehicle_seat: deathData == null ? void 0 : deathData.killervehseat,
          killer_position: compactJsonValue(deathData == null ? void 0 : deathData.killerpos)
        }
      });
    }
  );
}
function compactJsonValue(value) {
  if (value === void 0) return null;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= 2048) return JSON.parse(serialized);
    return {
      truncated: true,
      preview: serialized.slice(0, 2048)
    };
  } catch {
    return String(value);
  }
}

// src/server/logs/event.ts
var LOG_LEVELS = /* @__PURE__ */ new Set([
  "debug",
  "info",
  "warn",
  "error",
  "fatal"
]);
var EVENT_ID_PATTERN = /^[A-Za-z0-9:_-]{8,64}$/;
var EVENT_TYPE_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,95}$/;
var IDENTIFIER_KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
var MAX_PAST_AGE_MS = 7 * 24 * 60 * 60 * 1e3;
var MAX_FUTURE_SKEW_MS = 5 * 60 * 1e3;
var MAX_EVENT_BYTES = 16 * 1024;
function buildLogEvent(level, message, options, context) {
  if (!LOG_LEVELS.has(level)) {
    throw new Error("Log level must be debug, info, warn, error, or fatal.");
  }
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("Log message must be a non-empty string.");
  }
  if (message.length > 2048) {
    throw new Error("Log message must be at most 2,048 characters.");
  }
  const eventId = options.eventId ?? context.eventId;
  if (!EVENT_ID_PATTERN.test(eventId)) {
    throw new Error(
      "Log eventId must contain 8-64 letters, digits, colons, underscores, or hyphens."
    );
  }
  const eventType = options.eventType ?? "log";
  if (!EVENT_TYPE_PATTERN.test(eventType)) {
    throw new Error(
      "Log eventType must be lowercase and use letters, digits, dots, colons, underscores, or hyphens."
    );
  }
  const occurredAt = options.occurredAt ? new Date(options.occurredAt) : context.now;
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
    96
  );
  const playerId2 = optionalPlayerId(options.playerId, "playerId");
  const targetPlayerId = optionalPlayerId(
    options.targetPlayerId,
    "targetPlayerId"
  );
  const playerIdentifiers = mergeIdentifiers(
    playerId2 ? context.getIdentifiers(playerId2) : void 0,
    options.playerIdentifiers,
    "playerIdentifiers"
  );
  const targetPlayerIdentifiers = mergeIdentifiers(
    targetPlayerId ? context.getIdentifiers(targetPlayerId) : void 0,
    options.targetPlayerIdentifiers,
    "targetPlayerIdentifiers"
  );
  const data = normalizeData(options.data);
  const event = {
    event_id: eventId,
    event_type: eventType,
    level,
    message,
    occurred_at: occurredAt.toISOString()
  };
  if (resource) event.resource = resource;
  if (playerId2) event.player_id = playerId2;
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
    64
  );
  if (environment) event.environment = environment;
  if (data) event.data = data;
  if (Buffer.byteLength(JSON.stringify(event), "utf8") > MAX_EVENT_BYTES) {
    throw new Error("Log event exceeds the 16 KiB ingestion limit.");
  }
  return event;
}
function optionalPlayerId(value, field) {
  if (value === void 0 || value === null) return void 0;
  return optionalString(String(value), field, 128);
}
function optionalString(value, field, maximumLength) {
  if (value === void 0 || value === null) return void 0;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Log ${field} must be a non-empty string.`);
  }
  if (value.length > maximumLength) {
    throw new Error(
      `Log ${field} must be at most ${maximumLength} characters.`
    );
  }
  return value;
}
function mergeIdentifiers(discovered, explicit, field) {
  if (explicit !== void 0 && !isPlainObject(explicit)) {
    throw new Error(`Log ${field} must be an object.`);
  }
  const identifiers = {
    ...discovered ?? {},
    ...explicit ?? {}
  };
  const entries = Object.entries(identifiers);
  if (entries.length === 0) return void 0;
  if (entries.length > 16) {
    throw new Error(`Log ${field} cannot contain more than 16 identifiers.`);
  }
  for (const [key, value] of entries) {
    if (!IDENTIFIER_KEY_PATTERN.test(key)) {
      throw new Error(`Log ${field} contains an invalid identifier key.`);
    }
    if (typeof value !== "string" || !value || value.length > 256) {
      throw new Error(
        `Log ${field}.${key} must be a non-empty string up to 256 characters.`
      );
    }
  }
  return identifiers;
}
function normalizeData(value) {
  if (value === void 0 || value === null) return void 0;
  if (!isPlainObject(value)) {
    throw new Error("Log data must be an object.");
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new Error("Log data must be JSON serializable.");
  }
}
function isPlainObject(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// src/server/logs/identifier-format.ts
var IDENTIFIER_KEY_PATTERN2 = /^[a-z][a-z0-9_]{0,31}$/;
var MAX_IDENTIFIER_COUNT = 16;
var MAX_IDENTIFIER_VALUE_LENGTH = 256;
function formatPlayerIdentifiers(rawIdentifiers, excluded = /* @__PURE__ */ new Set()) {
  const identifiers = {};
  for (const rawIdentifier of rawIdentifiers) {
    if (Object.keys(identifiers).length >= MAX_IDENTIFIER_COUNT) break;
    const separator = rawIdentifier.indexOf(":");
    if (separator <= 0) continue;
    const key = rawIdentifier.slice(0, separator).toLowerCase();
    const value = rawIdentifier.slice(separator + 1);
    if (!IDENTIFIER_KEY_PATTERN2.test(key) || excluded.has(key) || !value || value.length > MAX_IDENTIFIER_VALUE_LENGTH) {
      continue;
    }
    identifiers[key] = value;
  }
  return identifiers;
}

// src/server/logs/identifiers.ts
var IDENTIFIER_CACHE_TTL_MS = 5 * 60 * 1e3;
var MAX_CACHED_PLAYERS = 512;
var identifierCache = /* @__PURE__ */ new Map();
var lifecycleRegistered = false;
function getPlayerIdentifiers(playerId2, options = {}) {
  const source = normalizePlayerId(playerId2);
  const cached = identifierCache.get(source);
  if (!options.force && cached && Date.now() - cached.capturedAt < IDENTIFIER_CACHE_TTL_MS) {
    return { ...cached.identifiers };
  }
  const rawIdentifiers = [];
  try {
    const count = GetNumPlayerIdentifiers(source);
    for (let index = 0; index < count; index += 1) {
      const identifier = GetPlayerIdentifier(source, index);
      if (identifier) rawIdentifiers.push(identifier);
    }
  } catch {
    cacheIdentifiers(source, {});
    return {};
  }
  const identifiers = formatPlayerIdentifiers(
    rawIdentifiers,
    getExcludedPlayerIdentifiers()
  );
  cacheIdentifiers(source, identifiers);
  return { ...identifiers };
}
function clearPlayerIdentifiers(playerId2) {
  identifierCache.delete(normalizePlayerId(playerId2));
}
function movePlayerIdentifiers(previousPlayerId, nextPlayerId) {
  const previous = identifierCache.get(normalizePlayerId(previousPlayerId));
  if (!previous) return;
  identifierCache.set(normalizePlayerId(nextPlayerId), previous);
  identifierCache.delete(normalizePlayerId(previousPlayerId));
}
function registerIdentifierLifecycle() {
  if (lifecycleRegistered) return;
  lifecycleRegistered = true;
  on("playerJoining", (oldPlayerId) => {
    const playerId2 = String(global.source);
    movePlayerIdentifiers(oldPlayerId, playerId2);
    getPlayerIdentifiers(playerId2, { force: true });
  });
  on("playerDropped", () => {
    const playerId2 = String(global.source);
    setImmediate(() => clearPlayerIdentifiers(playerId2));
  });
}
function cacheIdentifiers(playerId2, identifiers) {
  if (identifierCache.size >= MAX_CACHED_PLAYERS) {
    const oldest = identifierCache.keys().next().value;
    if (oldest !== void 0) identifierCache.delete(oldest);
  }
  identifierCache.set(playerId2, {
    identifiers,
    capturedAt: Date.now()
  });
}
function normalizePlayerId(playerId2) {
  const normalized = String(playerId2).trim();
  if (!normalized || normalized.length > 128) {
    throw new Error("Player IDs must be non-empty and at most 128 characters.");
  }
  return normalized;
}

// src/server/logs/ox-inventory.ts
var POST_HOOK_MINIMUM_VERSION = [2, 47, 0];
var postHookListeners = /* @__PURE__ */ new Map();
var lifecycleRegistered2 = false;
var hooksRegistered = false;
function startOxInventoryLogging(write) {
  if (!lifecycleRegistered2) {
    lifecycleRegistered2 = true;
    on("onServerResourceStart", (resourceName) => {
      if (resourceName !== "ox_inventory") return;
      hooksRegistered = false;
      setImmediate(() => registerOxInventoryHooks(write));
    });
    on("onServerResourceStop", (resourceName) => {
      if (resourceName !== "ox_inventory") return;
      hooksRegistered = false;
      clearPostHookListeners();
    });
  }
  if (GetResourceState("ox_inventory") === "started") {
    registerOxInventoryHooks(write);
  } else {
    console.log(
      "[FiveMesh SDK] ox_inventory automatic logging is enabled and will attach when ox_inventory starts."
    );
  }
}
function registerOxInventoryHooks(write) {
  if (hooksRegistered || GetResourceState("ox_inventory") !== "started") {
    return;
  }
  try {
    const oxInventory = global.exports["ox_inventory"];
    const version = GetResourceMetadata("ox_inventory", "version", 0) || "unknown";
    const supportsPostHooks = versionAtLeast(
      version,
      POST_HOOK_MINIMUM_VERSION
    );
    registerHook(
      oxInventory,
      "buyItem",
      supportsPostHooks,
      (payload) => logPurchase(write, payload)
    );
    registerHook(
      oxInventory,
      "craftItem",
      supportsPostHooks,
      (payload) => logCraft(write, payload)
    );
    registerHook(
      oxInventory,
      "swapItems",
      supportsPostHooks,
      (payload) => logTransfer(write, payload)
    );
    registerHook(
      oxInventory,
      "usingItem",
      supportsPostHooks,
      (payload) => logUse(write, payload)
    );
    hooksRegistered = true;
    console.log(
      `[FiveMesh SDK] ox_inventory logging attached (${version}, ${supportsPostHooks ? "successful actions" : "observed attempts"}).`
    );
  } catch (error2) {
    console.error(
      `[FiveMesh SDK] Failed to attach ox_inventory logging: ${getErrorMessage2(error2)}`
    );
  }
}
function registerHook(oxInventory, eventName, supportsPostHooks, handler) {
  if (!supportsPostHooks) {
    oxInventory.registerHook(eventName, handler);
    return;
  }
  const hookId = oxInventory.registerHook(eventName, null);
  const hookEvent = String(hookId);
  const listener = (...args) => {
    const success = args[0] === true;
    const payload = args[1];
    if (!isRecord(payload)) return;
    if (success) handler(payload);
  };
  postHookListeners.set(hookEvent, listener);
  on(hookEvent, listener);
}
function logPurchase(write, payload) {
  const playerId2 = playerIdFrom(payload.source) ?? playerIdFrom(payload.toInventory);
  const itemName = displayString(payload.itemName, "item");
  const count = finiteNumber(payload.count);
  write("info", `Player ${playerId2 ?? "unknown"} purchased ${count ?? 1}x ${itemName}`, {
    eventType: "ox_inventory.item_purchased",
    playerId: playerId2,
    resource: "ox_inventory",
    data: {
      item_name: itemName,
      count,
      unit_price: finiteNumber(payload.price),
      total_price: finiteNumber(payload.totalPrice),
      currency: optionalString2(payload.currency),
      shop_type: optionalString2(payload.shopType),
      shop_id: primitiveValue(payload.shopId),
      destination_slot: finiteNumber(payload.toSlot),
      metadata: compactJsonValue2(payload.metadata)
    }
  });
}
function logCraft(write, payload) {
  const playerId2 = playerIdFrom(payload.source) ?? playerIdFrom(payload.toInventory);
  const recipe = isRecord(payload.recipe) ? payload.recipe : {};
  const itemName = displayString(recipe.name, "item");
  const count = finiteNumber(recipe.count);
  write("info", `Player ${playerId2 ?? "unknown"} crafted ${count ?? 1}x ${itemName}`, {
    eventType: "ox_inventory.item_crafted",
    playerId: playerId2,
    resource: "ox_inventory",
    data: {
      item_name: itemName,
      count,
      duration: finiteNumber(recipe.duration),
      ingredients: compactJsonValue2(recipe.ingredients),
      bench_id: primitiveValue(payload.benchId),
      bench_index: finiteNumber(payload.benchIndex),
      destination_slot: finiteNumber(payload.toSlot)
    }
  });
}
function logTransfer(write, payload) {
  const sourcePlayerId = playerIdFrom(payload.source);
  const fromPlayerId = playerIdFrom(payload.fromInventory);
  const toPlayerId = playerIdFrom(payload.toInventory);
  const targetPlayerId = [toPlayerId, fromPlayerId].find(
    (candidate) => candidate && candidate !== sourcePlayerId
  );
  const fromInventory = inventoryReference(payload.fromInventory);
  const toInventory = inventoryReference(payload.toInventory);
  if (payload.action !== "give" && JSON.stringify(fromInventory) === JSON.stringify(toInventory)) {
    return;
  }
  const fromSlot = slotSummary(payload.fromSlot);
  const toSlot = slotSummary(payload.toSlot);
  const itemName = optionalString2(fromSlot == null ? void 0 : fromSlot.name) ?? optionalString2(toSlot == null ? void 0 : toSlot.name) ?? "item";
  const count = finiteNumber(payload.count) ?? finiteNumber(fromSlot == null ? void 0 : fromSlot.count);
  write(
    "info",
    `Player ${sourcePlayerId ?? "unknown"} transferred ${count ?? 1}x ${itemName}`,
    {
      eventType: "ox_inventory.item_transferred",
      playerId: sourcePlayerId,
      targetPlayerId,
      resource: "ox_inventory",
      data: {
        action: optionalString2(payload.action),
        item_name: itemName,
        count,
        from_type: optionalString2(payload.fromType),
        to_type: optionalString2(payload.toType),
        from_inventory: fromInventory,
        to_inventory: toInventory,
        from_slot: fromSlot,
        to_slot: toSlot
      }
    }
  );
}
function logUse(write, payload) {
  const playerId2 = playerIdFrom(payload.source) ?? playerIdFrom(payload.inventoryId);
  const item = isRecord(payload.item) ? payload.item : {};
  const itemName = displayString(item.name, "item");
  write("info", `Player ${playerId2 ?? "unknown"} used ${itemName}`, {
    eventType: "ox_inventory.item_used",
    playerId: playerId2,
    resource: "ox_inventory",
    data: {
      item_name: itemName,
      item_label: optionalString2(item.label),
      slot: finiteNumber(item.slot),
      consume: finiteNumber(payload.consume),
      metadata: compactJsonValue2(item.metadata)
    }
  });
}
function playerIdFrom(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return String(value);
  }
  if (isRecord(value)) {
    if (value.type === "player" || value.player === true || typeof value.player === "object") {
      return playerIdFrom(value.id) ?? playerIdFrom(value.owner);
    }
  }
  return void 0;
}
function inventoryReference(value) {
  if (typeof value === "string" || typeof value === "number") return value;
  if (!isRecord(value)) return null;
  return {
    id: primitiveValue(value.id),
    type: optionalString2(value.type),
    owner: primitiveValue(value.owner),
    label: optionalString2(value.label)
  };
}
function slotSummary(value) {
  if (typeof value === "number") return { slot: value };
  if (!isRecord(value)) return null;
  return {
    name: optionalString2(value.name),
    label: optionalString2(value.label),
    count: finiteNumber(value.count),
    slot: finiteNumber(value.slot),
    metadata: compactJsonValue2(value.metadata)
  };
}
function compactJsonValue2(value) {
  if (value === void 0) return null;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= 4096) return JSON.parse(serialized);
    return {
      truncated: true,
      preview: serialized.slice(0, 4096)
    };
  } catch {
    return String(value);
  }
}
function primitiveValue(value) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null;
}
function optionalString2(value) {
  return typeof value === "string" && value ? value : void 0;
}
function displayString(value, fallback) {
  return optionalString2(value) ?? fallback;
}
function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function clearPostHookListeners() {
  for (const [eventName, listener] of postHookListeners) {
    removeEventListener(eventName, listener);
  }
  postHookListeners.clear();
}
function versionAtLeast(version, minimum) {
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  const parsed = match.slice(1, 4).map(Number);
  for (let index = 0; index < minimum.length; index += 1) {
    const current = parsed[index] ?? 0;
    const expected = minimum[index];
    if (current > expected) return true;
    if (current < expected) return false;
  }
  return true;
}
function getErrorMessage2(error2) {
  return error2 instanceof Error ? error2.message : String(error2);
}

// src/server/logs/txadmin.ts
var TXADMIN_EVENTS = [
  "announcement",
  "serverShuttingDown",
  "scheduledRestart",
  "scheduledRestartSkipped",
  "playerBanned",
  "playerDirectMessage",
  "playerHealed",
  "playerKicked",
  "playerWarned",
  "whitelistPlayer",
  "whitelistPreApproval",
  "whitelistRequest",
  "actionRevoked",
  "adminAuth",
  "adminsUpdated",
  "configChanged",
  "consoleCommand"
];
var registered = false;
function startTxAdminLogging(write) {
  if (registered) return;
  registered = true;
  for (const eventName of TXADMIN_EVENTS) {
    on(`txAdmin:events:${eventName}`, (eventData) => {
      try {
        const log = buildTxAdminLog(
          eventName,
          eventData,
          getExcludedPlayerIdentifiers()
        );
        if (log) write(log.level, log.message, log.options);
      } catch (error2) {
        console.error(
          `[FiveMesh SDK] txAdmin event "${eventName}" was skipped: ${getErrorMessage3(error2)}`
        );
      }
    });
  }
  console.log("[FiveMesh SDK] txAdmin automatic logging attached.");
}
function buildTxAdminLog(eventName, eventData, excludedIdentifiers = /* @__PURE__ */ new Set()) {
  const data = isRecord2(eventData) ? eventData : {};
  const baseData = {
    event_source: "txadmin"
  };
  switch (eventName) {
    case "announcement": {
      const author = displayString2(data.author, "txAdmin");
      const announcement = displayString2(data.message, "Announcement");
      return txAdminLog(
        "info",
        `txAdmin announcement from ${author}: ${announcement}`,
        "txadmin.announcement",
        {
          ...baseData,
          author,
          message: optionalString3(data.message)
        }
      );
    }
    case "serverShuttingDown": {
      const author = displayString2(data.author, "txAdmin");
      return txAdminLog(
        "warn",
        `Server shutdown initiated by ${author}`,
        "txadmin.server.shutting_down",
        {
          ...baseData,
          author,
          delay_ms: finiteNumber2(data.delay),
          message: optionalString3(data.message)
        }
      );
    }
    case "scheduledRestart": {
      const secondsRemaining = finiteNumber2(data.secondsRemaining);
      return txAdminLog(
        "warn",
        secondsRemaining === void 0 ? "Scheduled server restart approaching" : `Scheduled server restart in ${formatDuration(secondsRemaining)}`,
        "txadmin.server.scheduled_restart",
        {
          ...baseData,
          seconds_remaining: secondsRemaining,
          translated_message: optionalString3(data.translatedMessage)
        }
      );
    }
    case "scheduledRestartSkipped": {
      const author = displayString2(data.author, "txAdmin admin");
      return txAdminLog(
        "info",
        `Scheduled server restart skipped by ${author}`,
        "txadmin.server.scheduled_restart_skipped",
        {
          ...baseData,
          author,
          seconds_remaining: finiteNumber2(data.secondsRemaining),
          temporary: optionalBoolean(data.temporary)
        }
      );
    }
    case "playerBanned": {
      const targetPlayerId = playerId(data.targetNetId);
      const targetName = displayString2(
        data.targetName,
        targetPlayerId ? `player ${targetPlayerId}` : "identifiers"
      );
      const author = displayString2(data.author, "txAdmin admin");
      return txAdminLog(
        "warn",
        `${targetName} was banned by ${author}`,
        "txadmin.player.banned",
        {
          ...baseData,
          action_id: primitiveValue2(data.actionId),
          author,
          duration_input: optionalString3(data.durationInput),
          duration_translated: optionalString3(data.durationTranslated),
          expiration: primitiveValue2(data.expiration),
          hardware_identifier_count: arrayLength(data.targetHwids),
          kick_message: optionalString3(data.kickMessage),
          reason: optionalString3(data.reason),
          target_name: targetName
        },
        {
          targetPlayerId,
          targetPlayerIdentifiers: identifiersFrom(
            data.targetIds,
            excludedIdentifiers
          )
        }
      );
    }
    case "playerDirectMessage": {
      const targetPlayerId = playerId(data.target);
      const author = displayString2(data.author, "txAdmin admin");
      return txAdminLog(
        "info",
        `${author} sent a direct message to player ${targetPlayerId ?? "unknown"}`,
        "txadmin.player.direct_message",
        {
          ...baseData,
          author,
          message: optionalString3(data.message)
        },
        { targetPlayerId }
      );
    }
    case "playerHealed": {
      const targetPlayerId = playerId(data.target);
      const author = displayString2(data.author, "txAdmin admin");
      return txAdminLog(
        "info",
        targetPlayerId ? `Player ${targetPlayerId} was healed by ${author}` : `All players were healed by ${author}`,
        "txadmin.player.healed",
        {
          ...baseData,
          author,
          all_players: targetPlayerId === void 0
        },
        { targetPlayerId }
      );
    }
    case "playerKicked": {
      const targetPlayerId = playerId(data.target);
      const author = displayString2(data.author, "txAdmin admin");
      return txAdminLog(
        "warn",
        targetPlayerId ? `Player ${targetPlayerId} was kicked by ${author}` : `All players were kicked by ${author}`,
        "txadmin.player.kicked",
        {
          ...baseData,
          all_players: targetPlayerId === void 0,
          author,
          drop_message: optionalString3(data.dropMessage),
          reason: optionalString3(data.reason)
        },
        { targetPlayerId }
      );
    }
    case "playerWarned": {
      const targetPlayerId = playerId(data.targetNetId);
      const targetName = displayString2(
        data.targetName,
        targetPlayerId ? `player ${targetPlayerId}` : "offline player"
      );
      const author = displayString2(data.author, "txAdmin admin");
      return txAdminLog(
        "warn",
        `${targetName} was warned by ${author}`,
        "txadmin.player.warned",
        {
          ...baseData,
          action_id: primitiveValue2(data.actionId),
          author,
          reason: optionalString3(data.reason),
          target_name: targetName
        },
        {
          targetPlayerId,
          targetPlayerIdentifiers: identifiersFrom(
            data.targetIds,
            excludedIdentifiers
          )
        }
      );
    }
    case "whitelistPlayer": {
      const action = displayString2(data.action, "updated");
      const playerName = displayString2(data.playerName, "Player");
      const adminName = displayString2(data.adminName, "txAdmin admin");
      return txAdminLog(
        "info",
        `${playerName} whitelist access was ${action} by ${adminName}`,
        "txadmin.whitelist.player_updated",
        {
          ...baseData,
          action,
          admin_name: adminName,
          player_name: playerName
        },
        {
          targetPlayerIdentifiers: licenseIdentifier(
            data.license,
            excludedIdentifiers
          )
        }
      );
    }
    case "whitelistPreApproval": {
      const action = displayString2(data.action, "updated");
      const adminName = displayString2(data.adminName, "txAdmin admin");
      return txAdminLog(
        "info",
        `Whitelist pre-approval was ${action} by ${adminName}`,
        "txadmin.whitelist.preapproval_updated",
        {
          ...baseData,
          action,
          admin_name: adminName,
          player_name: optionalString3(data.playerName)
        },
        {
          targetPlayerIdentifiers: identifiersFrom(
            [data.identifier],
            excludedIdentifiers
          )
        }
      );
    }
    case "whitelistRequest": {
      const action = displayString2(data.action, "updated");
      const playerName = displayString2(data.playerName, "Whitelist request");
      return txAdminLog(
        "info",
        `${playerName} was ${action}`,
        "txadmin.whitelist.request_updated",
        {
          ...baseData,
          action,
          admin_name: optionalString3(data.adminName),
          player_name: optionalString3(data.playerName),
          request_id: primitiveValue2(data.requestId)
        },
        {
          targetPlayerIdentifiers: licenseIdentifier(
            data.license,
            excludedIdentifiers
          )
        }
      );
    }
    case "actionRevoked": {
      const actionType = displayString2(data.actionType, "action");
      const playerName = displayString2(data.playerName, "player");
      const revokedBy = displayString2(data.revokedBy, "txAdmin admin");
      return txAdminLog(
        "info",
        `${actionType} for ${playerName} was revoked by ${revokedBy}`,
        "txadmin.action.revoked",
        {
          ...baseData,
          action_author: optionalString3(data.actionAuthor),
          action_id: primitiveValue2(data.actionId),
          action_reason: optionalString3(data.actionReason),
          action_type: actionType,
          hardware_identifier_count: arrayLength(data.playerHwids),
          player_name: optionalString3(data.playerName),
          revoked_by: revokedBy
        },
        {
          targetPlayerIdentifiers: identifiersFrom(
            data.playerIds,
            excludedIdentifiers
          )
        }
      );
    }
    case "adminAuth": {
      const playerIdValue = playerId(data.netid);
      const authenticated = data.isAdmin === true;
      const username = displayString2(data.username, "Admin");
      return txAdminLog(
        "info",
        playerIdValue ? `${username} ${authenticated ? "authenticated" : "lost authentication"} in game` : "All txAdmin in-game authentications were revoked",
        "txadmin.admin.auth_changed",
        {
          ...baseData,
          all_admins: playerIdValue === void 0,
          is_admin: authenticated,
          username: optionalString3(data.username)
        },
        { playerId: playerIdValue }
      );
    }
    case "adminsUpdated": {
      return txAdminLog(
        "info",
        "txAdmin administrator configuration was updated",
        "txadmin.admins.updated",
        {
          ...baseData,
          online_admin_count: arrayLength(eventData)
        }
      );
    }
    case "configChanged": {
      return txAdminLog(
        "info",
        "txAdmin server configuration changed",
        "txadmin.config.changed",
        baseData
      );
    }
    case "consoleCommand": {
      const author = displayString2(data.author, "txAdmin admin");
      const command = commandSummary(data.command);
      return txAdminLog(
        "info",
        `${author} executed the ${command.name ?? "unknown"} console command`,
        "txadmin.console.command",
        {
          ...baseData,
          arguments_redacted: command.argumentsRedacted,
          author,
          channel: optionalString3(data.channel),
          command_name: command.name
        }
      );
    }
    default:
      return null;
  }
}
function txAdminLog(level, message, eventType, data, player = {}) {
  return {
    level,
    message: truncate(message, 2048),
    options: {
      eventType,
      resource: "txadmin",
      data,
      ...player
    }
  };
}
function identifiersFrom(value, excludedIdentifiers) {
  const values = Array.isArray(value) ? value : [];
  const identifiers = formatPlayerIdentifiers(
    values.filter((entry) => typeof entry === "string"),
    excludedIdentifiers
  );
  return Object.keys(identifiers).length > 0 ? identifiers : void 0;
}
function licenseIdentifier(value, excludedIdentifiers) {
  if (excludedIdentifiers.has("license")) return void 0;
  const license = optionalString3(value, 256);
  if (!license) return void 0;
  const normalized = license.startsWith("license:") ? license.slice("license:".length) : license;
  if (!normalized) return void 0;
  return {
    license: normalized
  };
}
function playerId(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return String(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value) && Number(value) >= 0) {
    return value;
  }
  return void 0;
}
function commandSummary(value) {
  var _a;
  const command = (_a = optionalString3(value, 2048)) == null ? void 0 : _a.trim();
  if (!command) return { argumentsRedacted: false };
  const separator = command.search(/[\s=]/);
  return {
    argumentsRedacted: separator >= 0,
    name: truncate(separator >= 0 ? command.slice(0, separator) : command, 128)
  };
}
function formatDuration(seconds) {
  if (seconds >= 60 && seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}
function optionalString3(value, maximumLength = 1024) {
  return typeof value === "string" && value.trim() ? truncate(value, maximumLength) : void 0;
}
function displayString2(value, fallback) {
  return optionalString3(value, 256) ?? fallback;
}
function optionalBoolean(value) {
  return typeof value === "boolean" ? value : void 0;
}
function finiteNumber2(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function primitiveValue2(value) {
  if (typeof value === "string") return truncate(value, 1024);
  return typeof value === "number" || typeof value === "boolean" ? value : null;
}
function arrayLength(value) {
  return Array.isArray(value) ? value.length : 0;
}
function truncate(value, maximumLength) {
  return value.length <= maximumLength ? value : `${value.slice(0, Math.max(0, maximumLength - 1))}\u2026`;
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function getErrorMessage3(error2) {
  return error2 instanceof Error ? error2.message : String(error2);
}

// src/server/logs/transport.ts
var import_node_crypto = require("node:crypto");
var MAX_PENDING_EVENTS = 2e3;
var REQUEST_TIMEOUT_MS = 18e4;
var DEFAULT_IN_PROGRESS_RETRY_MS = 5e3;
var MAX_RETRY_AFTER_MS = 3e4;
var LogsTransportError = class extends Error {
  code;
  details;
  requestId;
  retryAfterMs;
  retryable;
  status;
  constructor(input) {
    super(input.message);
    this.name = "LogsTransportError";
    this.code = input.code;
    this.details = input.details;
    this.requestId = input.requestId;
    this.retryAfterMs = input.retryAfterMs;
    this.retryable = input.retryable;
    this.status = input.status;
  }
};
var LogsTransport = class {
  batchSize;
  flushIntervalMs;
  sendBatch;
  flushPromise;
  interval;
  pending = [];
  retryBatch;
  lastReportedFailure = "";
  lastReportedFailureAt = 0;
  constructor(options) {
    this.batchSize = options.batchSize;
    this.flushIntervalMs = options.flushIntervalMs;
    this.sendBatch = options.sendBatch ?? sendLogsBatch;
  }
  enqueue(event) {
    if (this.pendingEvents >= MAX_PENDING_EVENTS) {
      throw new Error(
        `FiveMesh Logs queue is full (${MAX_PENDING_EVENTS} events).`
      );
    }
    this.pending.push(event);
    this.start();
    if (this.pending.length >= this.batchSize) {
      this.flushInBackground();
    }
    return this.pending.length;
  }
  get pendingEvents() {
    var _a;
    return this.pending.length + (((_a = this.retryBatch) == null ? void 0 : _a.events.length) ?? 0);
  }
  start() {
    if (this.interval) return;
    this.interval = setInterval(() => {
      if (this.pendingEvents > 0) this.flushInBackground();
    }, this.flushIntervalMs);
  }
  async flush() {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.flushPending();
    try {
      return await this.flushPromise;
    } finally {
      this.flushPromise = void 0;
    }
  }
  async close() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = void 0;
    }
    return this.flush();
  }
  flushInBackground() {
    void this.flush().catch((error2) => this.reportFailure(error2));
  }
  async flushPending() {
    let acceptedEvents = 0;
    let batches = 0;
    while (this.retryBatch || this.pending.length > 0) {
      const batch = this.retryBatch ?? {
        batchId: `batch_${(0, import_node_crypto.randomUUID)()}`,
        events: this.pending.splice(0, this.batchSize)
      };
      this.retryBatch = batch;
      try {
        const accepted = await this.sendBatch(batch);
        this.retryBatch = void 0;
        acceptedEvents += accepted;
        batches += 1;
      } catch (error2) {
        if (error2 instanceof LogsTransportError && error2.retryable && (error2.code === "batch_in_progress" || error2.code === "LOGS_REQUEST_TIMEOUT")) {
          await delay(error2.retryAfterMs ?? DEFAULT_IN_PROGRESS_RETRY_MS);
          continue;
        }
        if (!(error2 instanceof LogsTransportError && error2.retryable)) {
          this.retryBatch = void 0;
        }
        throw error2;
      }
    }
    return {
      success: true,
      acceptedEvents,
      batches,
      pendingEvents: this.pending.length
    };
  }
  reportFailure(error2) {
    const message = getErrorMessage4(error2);
    const now = Date.now();
    if (message === this.lastReportedFailure && now - this.lastReportedFailureAt < 3e4) {
      return;
    }
    this.lastReportedFailure = message;
    this.lastReportedFailureAt = now;
    console.error(
      `[FiveMesh SDK] Logs batch failed: ${message}. Pending events: ${this.pendingEvents}.`
    );
  }
};
async function sendLogsBatch(batch) {
  const serverId = getLogsServerId();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(
      `${getLogsBaseUrl()}/v1/servers/${encodeURIComponent(serverId)}/logs`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: getLogsBearerToken(),
          "content-type": "application/json"
        },
        body: JSON.stringify({
          batch_id: batch.batchId,
          events: batch.events
        }),
        signal: controller.signal
      }
    );
  } catch (error2) {
    const timedOut = controller.signal.aborted;
    throw new LogsTransportError({
      code: timedOut ? "LOGS_REQUEST_TIMEOUT" : "LOGS_NETWORK_ERROR",
      message: timedOut ? `FiveMesh Logs acknowledgement timed out after ${REQUEST_TIMEOUT_MS}ms; the batch will be reconciled automatically.` : `FiveMesh Logs request failed: ${getErrorMessage4(error2)}`,
      retryable: true
    });
  } finally {
    clearTimeout(timeout);
  }
  const requestId = response.headers.get("x-request-id") ?? void 0;
  const payload = await response.json().catch(() => null);
  if (response.status !== 202 || !(payload == null ? void 0 : payload.accepted) || payload.accepted_events !== batch.events.length) {
    throw new LogsTransportError({
      code: (payload == null ? void 0 : payload.error) ?? "LOGS_INGESTION_FAILED",
      message: (payload == null ? void 0 : payload.message) ?? `FiveMesh Logs ingestion failed with HTTP ${response.status}.`,
      details: payload,
      requestId: (payload == null ? void 0 : payload.request_id) ?? requestId,
      retryAfterMs: parseRetryAfterMs(response.headers.get("retry-after")),
      retryable: response.status === 429 || response.status >= 500,
      status: response.status
    });
  }
  return payload.accepted_events;
}
function getErrorMessage4(error2) {
  return error2 instanceof Error ? error2.message : String(error2);
}
function parseRetryAfterMs(value) {
  if (!value) return void 0;
  const seconds = Number(value);
  const milliseconds = Number.isFinite(seconds) ? seconds * 1e3 : Date.parse(value) - Date.now();
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return void 0;
  return Math.min(milliseconds, MAX_RETRY_AFTER_MS);
}
function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

// src/server/logs/logger.ts
var transport = null;
var started = false;
function queueLog(level, message, options = {}) {
  if (!isRecord3(options)) {
    throw new Error("Log options must be an object.");
  }
  getLogsServerId();
  const activeTransport = getTransport();
  const event = buildLogEvent(level, message, options, {
    eventId: (0, import_node_crypto2.randomUUID)(),
    environment: getLogsEnvironment(),
    getIdentifiers: getPlayerIdentifiers,
    now: /* @__PURE__ */ new Date(),
    resource: options.resource || GetInvokingResource() || GetCurrentResourceName()
  });
  const pendingEvents = activeTransport.enqueue(event);
  return {
    success: true,
    queued: true,
    eventId: event.event_id,
    pendingEvents
  };
}
function debug(message, options = {}) {
  return queueLog("debug", message, options);
}
function info(message, options = {}) {
  return queueLog("info", message, options);
}
function warn(message, options = {}) {
  return queueLog("warn", message, options);
}
function error(message, options = {}) {
  return queueLog("error", message, options);
}
function fatal(message, options = {}) {
  return queueLog("fatal", message, options);
}
function flushLogs() {
  return getTransport().flush();
}
function startLogsFeature() {
  if (started) return;
  const automatic = getAutomaticLoggingEnabled();
  const baseEvents = getBaseEventsLoggingEnabled();
  const oxInventory = getOxInventoryLoggingEnabled();
  const txAdmin = getTxAdminLoggingEnabled();
  if (automatic || baseEvents || oxInventory || txAdmin) {
    assertLogsWriteConfig();
    getLogsServerId();
  }
  started = true;
  registerIdentifierLifecycle();
  if (automatic || baseEvents || oxInventory || txAdmin) {
    getTransport().start();
  }
  const writeAutomatic = (level, message, options) => {
    try {
      queueLog(level, message, options);
    } catch (logError) {
      console.error(
        `[FiveMesh SDK] Automatic log "${options.eventType ?? "log"}" was skipped: ${getErrorMessage5(logError)}`
      );
    }
  };
  if (automatic || baseEvents) {
    startAutomaticLogging(writeAutomatic, {
      baseEvents,
      core: automatic
    });
  }
  if (oxInventory) {
    startOxInventoryLogging(writeAutomatic);
  }
  if (txAdmin) {
    startTxAdminLogging(writeAutomatic);
  }
  on("onResourceStop", (resourceName) => {
    if (resourceName !== GetCurrentResourceName() || !transport) return;
    void transport.close().catch((closeError) => {
      console.error(
        `[FiveMesh SDK] Final Logs flush failed: ${getErrorMessage5(closeError)}`
      );
    });
  });
  if (automatic || baseEvents || oxInventory || txAdmin) {
    console.log(
      `[FiveMesh SDK] Logs ready. Automatic: ${automatic ? "on" : "off"}; baseevents: ${baseEvents ? "on" : "off"}; ox_inventory: ${oxInventory ? "on" : "off"}; txAdmin: ${txAdmin ? "on" : "off"}.`
    );
  }
}
function getTransport() {
  transport ??= new LogsTransport({
    batchSize: getLogsBatchSize(),
    flushIntervalMs: getLogsFlushIntervalMs()
  });
  return transport;
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function getErrorMessage5(logError) {
  return logError instanceof Error ? logError.message : String(logError);
}

// src/server/logs/query.ts
var DEFAULT_LOOKBACK_MINUTES = 6 * 60;
var MAX_LOOKBACK_MINUTES = 7 * 24 * 60;
function buildLogsQueryRequest(options, context) {
  const serverId = (options.serverId ?? context.serverId).trim().toLowerCase();
  if (!/^[a-z0-9-]{3,64}$/.test(serverId)) {
    throw new Error("A valid FiveMesh CFX server ID is required.");
  }
  if (options.from && options.lookbackMinutes !== void 0) {
    throw new Error("Use either from or lookbackMinutes, not both.");
  }
  const to = parseQueryDate(options.to, "to", context.now);
  const lookbackMinutes = options.lookbackMinutes ?? DEFAULT_LOOKBACK_MINUTES;
  if (!Number.isInteger(lookbackMinutes) || lookbackMinutes < 1 || lookbackMinutes > MAX_LOOKBACK_MINUTES) {
    throw new Error(
      `lookbackMinutes must be an integer between 1 and ${MAX_LOOKBACK_MINUTES}.`
    );
  }
  const from = options.from ? parseQueryDate(options.from, "from") : new Date(to.getTime() - lookbackMinutes * 60 * 1e3);
  if (from > to) {
    throw new Error("The FiveMesh Logs query time range is invalid.");
  }
  if (to.getTime() - from.getTime() > MAX_LOOKBACK_MINUTES * 60 * 1e3) {
    throw new Error("FiveMesh Logs queries may span at most seven days.");
  }
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("limit must be an integer between 1 and 100.");
  }
  const request = {
    serverId,
    from: from.toISOString(),
    to: to.toISOString(),
    limit
  };
  const level = options.level ?? void 0;
  const eventType = optionalString4(options.eventType);
  const resource = optionalString4(options.resource);
  const message = optionalString4(options.message);
  const playerId2 = options.playerId == null ? void 0 : optionalString4(String(options.playerId));
  const identifier = options.identifier ?? void 0;
  const cursor = optionalString4(options.cursor);
  if (level) request.level = level;
  if (eventType) request.eventType = eventType;
  if (resource) request.resource = resource;
  if (message) request.message = message;
  if (playerId2) request.playerId = playerId2;
  if (identifier) request.identifier = identifier;
  if (cursor) request.cursor = cursor;
  return request;
}
function queryLogs(options = {}) {
  const { keyProfile } = options;
  const body = buildLogsQueryRequest(options, {
    now: /* @__PURE__ */ new Date(),
    serverId: getLogsServerId()
  });
  return requestJson(getApiBaseUrl(), "/logs/query", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    authorization: getLogsQueryBearerToken(keyProfile),
    timeoutMs: 3e4
  });
}
function parseQueryDate(value, label, fallback) {
  const date = value ? new Date(value) : fallback;
  if (!date || Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid RFC 3339 timestamp.`);
  }
  return date;
}
function optionalString4(value) {
  const normalized = value == null ? void 0 : value.trim();
  return normalized || void 0;
}

// src/server/rpc.ts
function registerRpc(eventName, handler) {
  onNet(eventName, (responseEvent, payload) => {
    const playerSource = global.source;
    Promise.resolve(handler(playerSource, payload)).then((data) => {
      emitNet(responseEvent, playerSource, {
        success: true,
        data
      });
    }).catch((error2) => {
      emitNet(responseEvent, playerSource, {
        success: false,
        error: getErrorMessage(error2)
      });
    });
  });
}

// src/server/screenshots.ts
function ensureScreenshotBasic() {
  const screenshot = exports["screenshot-basic"];
  if (!(screenshot == null ? void 0 : screenshot.requestClientScreenshot)) {
    throw new Error(
      "screenshot-basic is required for FiveMesh screenshot exports."
    );
  }
  return screenshot;
}
function takeServerImage(playerSource, metadata, options = {}, timeoutMs = 15e3) {
  const screenshot = ensureScreenshotBasic();
  const encoding = options.encoding ?? "webp";
  const quality = options.quality ?? 0.82;
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(new Error(`Screenshot capture timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
    screenshot.requestClientScreenshot(
      playerSource,
      { encoding, quality },
      (error2, data) => {
        if (settled) return;
        if (error2) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(error2));
          return;
        }
        uploadImage(data, metadata, {
          ...options,
          filename: options.filename ?? `screenshot.${encoding}`
        }).then((response) => {
          settled = true;
          clearTimeout(timeout);
          resolve(response);
        }).catch((uploadError) => {
          settled = true;
          clearTimeout(timeout);
          reject(uploadError);
        });
      }
    );
  });
}
function uploadImageData(payload) {
  return uploadImage(payload.data, payload.metadata, payload.options);
}
function takeImageFromRpc(playerSource, payload = {}) {
  return takeServerImage(playerSource, payload.metadata, payload.options);
}

// src/shared/exports.ts
function toExportFailure(error2) {
  const apiError = error2;
  const failure = {
    success: false,
    error: {
      code: typeof apiError.code === "string" ? apiError.code : "SDK_EXPORT_FAILED",
      message: getErrorMessage(error2)
    }
  };
  if (typeof apiError.requestId === "string") {
    failure.requestId = apiError.requestId;
  }
  if (apiError.details !== void 0) {
    failure.error.details = apiError.details;
  } else if (typeof apiError.status === "number") {
    failure.error.details = { status: apiError.status };
  }
  return failure;
}
function wrapExport(name, handler) {
  return async (...args) => {
    var _a, _b, _c;
    try {
      return await handler(...args);
    } catch (error2) {
      const failure = toExportFailure(error2);
      const context = [
        `code=${(_a = failure.error) == null ? void 0 : _a.code}`,
        failure.requestId ? `requestId=${failure.requestId}` : null,
        ((_b = failure.error) == null ? void 0 : _b.details) !== void 0 ? `details=${JSON.stringify(failure.error.details)}` : null
      ].filter(Boolean).join(" ");
      console.error(
        `[FiveMesh SDK] Export "${name}" failed: ${(_c = failure.error) == null ? void 0 : _c.message} (${context})`
      );
      return failure;
    }
  };
}

// src/server/index.ts
try {
  assertRequiredConfig();
} catch (error2) {
  console.error(
    `[FiveMesh SDK] Configuration check failed: ${error2 instanceof Error ? error2.message : String(error2)}`
  );
  throw error2;
}
registerRpc("fivemesh:sdk:takeImage", takeImageFromRpc);
registerRpc(
  "fivemesh:sdk:uploadImageData",
  (_source, payload) => uploadImageData(payload)
);
startLogsFeature();
exports("listObjects", wrapExport("listObjects", listObjects));
exports("uploadFile", wrapExport("uploadFile", uploadFile));
exports("uploadImage", wrapExport("uploadImage", uploadImage));
exports("bulkUpload", wrapExport("bulkUpload", bulkUpload));
exports("deleteObject", wrapExport("deleteObject", deleteObject));
exports("bulkDelete", wrapExport("bulkDelete", bulkDelete));
exports("purgeObjects", wrapExport("purgeObjects", purgeObjects));
exports("createPresignedUrl", wrapExport("createPresignedUrl", createPresignedUrl));
exports(
  "uploadWithPresignedUrl",
  wrapExport("uploadWithPresignedUrl", uploadWithPresignedUrl)
);
exports("takeServerImage", wrapExport("takeServerImage", takeServerImage));
exports("log", wrapExport("log", queueLog));
exports("debug", wrapExport("debug", debug));
exports("info", wrapExport("info", info));
exports("warn", wrapExport("warn", warn));
exports("error", wrapExport("error", error));
exports("fatal", wrapExport("fatal", fatal));
exports("flushLogs", wrapExport("flushLogs", flushLogs));
exports("queryLogs", wrapExport("queryLogs", queryLogs));
if (getDebugEnabled()) {
  console.log(`[FiveMesh SDK] Ready. API base URL: ${getApiBaseUrl()}`);
} else {
  console.log("[FiveMesh SDK] Ready.");
}
