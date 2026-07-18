"use strict";

// src/server/config.ts
var DEFAULT_API_BASE_URL = "https://api.fivemesh.io/v1";
function readConvar(name, fallback = "") {
  return GetConvar(name, fallback).trim();
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
  const key = readConvar("FIVEMESH_API_KEY") || readConvar("FIVEMESH_CDN_API_KEY") || readConvar("FIVEMESH_SERVICE_API_KEY");
  if (!key) {
    throw new Error(
      "Missing FiveMesh API key. Add `set FIVEMESH_API_KEY fm_live_...` to server.cfg."
    );
  }
  return key;
}
function assertRequiredConfig() {
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

// src/server/files.ts
function parseDataUrl(value) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(value);
  if (!match) {
    return { bytes: Buffer.from(value) };
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
    const parsed = parseDataUrl(input);
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
function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
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
    headers.authorization = getBearerToken(options.keyProfile);
  }
  const response = await fetch(buildUrl(baseUrl, path, options.query), {
    method: options.method ?? "GET",
    headers,
    body: options.body
  });
  const requestId = response.headers.get("x-request-id") ?? void 0;
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || !payload?.success) {
    const apiError = payload?.error;
    throw new FiveMeshApiError({
      code: apiError?.code ?? "REQUEST_FAILED",
      message: apiError?.message ?? `FiveMesh API request failed with HTTP ${response.status}.`,
      status: response.status,
      requestId: payload?.requestId ?? requestId,
      details: apiError?.details
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
    contentType: options.contentType
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
        contentType: item.contentType
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
    contentType: options.contentType
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

// src/server/rpc.ts
function registerRpc(eventName, handler) {
  onNet(eventName, (responseEvent, payload) => {
    const playerSource = global.source;
    Promise.resolve(handler(playerSource, payload)).then((data) => {
      emitNet(responseEvent, playerSource, {
        success: true,
        data
      });
    }).catch((error) => {
      emitNet(responseEvent, playerSource, {
        success: false,
        error: getErrorMessage(error)
      });
    });
  });
}

// src/server/screenshots.ts
function ensureScreenshotBasic() {
  const screenshot = exports["screenshot-basic"];
  if (!screenshot?.requestClientScreenshot) {
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
      (error, data) => {
        if (settled) return;
        if (error) {
          settled = true;
          clearTimeout(timeout);
          reject(new Error(error));
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
function isCallback(value) {
  return typeof value === "function";
}
function deferToNextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
function toExportFailure(error) {
  const apiError = error;
  return {
    success: false,
    requestId: typeof apiError.requestId === "string" ? apiError.requestId : void 0,
    error: {
      code: typeof apiError.code === "string" ? apiError.code : "SDK_EXPORT_FAILED",
      message: getErrorMessage(error),
      details: apiError.details ?? (typeof apiError.status === "number" ? { status: apiError.status } : void 0)
    }
  };
}
function wrapExport(name, handler) {
  return (...rawArgs) => {
    const maybeCallback = rawArgs[rawArgs.length - 1];
    const callback = isCallback(maybeCallback) ? maybeCallback : void 0;
    const args = callback ? rawArgs.slice(0, -1) : rawArgs;
    const promise = deferToNextTick().then(() => handler(...args)).catch((error) => {
      const failure = toExportFailure(error);
      console.error(
        `[FiveMesh SDK] Export "${name}" failed: ${failure.error?.message}`
      );
      return failure;
    });
    if (!callback) {
      return promise;
    }
    promise.then((result) => {
      if (result.success === false) {
        callback(null, result.error?.message);
        return;
      }
      callback(result);
    });
    return null;
  };
}

// src/server/index.ts
try {
  assertRequiredConfig();
} catch (error) {
  console.error(
    `[FiveMesh SDK] Configuration check failed: ${error instanceof Error ? error.message : String(error)}`
  );
  throw error;
}
registerRpc("fivemesh:sdk:takeImage", takeImageFromRpc);
registerRpc(
  "fivemesh:sdk:uploadImageData",
  (_source, payload) => uploadImageData(payload)
);
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
if (getDebugEnabled()) {
  console.log(`[FiveMesh SDK] Ready. API base URL: ${getApiBaseUrl()}`);
} else {
  console.log("[FiveMesh SDK] Ready.");
}
