"use strict";
(() => {
  // src/client/rpc.ts
  var RPC_TIMEOUT_MS = 2e4;
  var rpcCounter = 0;
  function callServer(eventName, payload, timeoutMs = RPC_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      let timedOut = false;
      const responseEvent = `${eventName}:response:${GetPlayerServerId(PlayerId())}:${rpcCounter++}:${Math.random().toString(36).slice(2)}`;
      const timeout = setTimeout(() => {
        timedOut = true;
        removeEventListener(responseEvent, handleResponse);
        reject(new Error(`FiveMesh RPC "${eventName}" timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      function handleResponse(response) {
        if (timedOut) return;
        clearTimeout(timeout);
        removeEventListener(responseEvent, handleResponse);
        if (response.success) {
          resolve(response.data);
          return;
        }
        reject(new Error(response.error));
      }
      onNet(responseEvent, handleResponse);
      emitNet(eventName, responseEvent, payload);
    });
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

  // src/shared/exports.ts
  function toExportFailure(error) {
    const apiError = error;
    const failure = {
      success: false,
      error: {
        code: typeof apiError.code === "string" ? apiError.code : "SDK_EXPORT_FAILED",
        message: getErrorMessage(error)
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
      try {
        return await handler(...args);
      } catch (error) {
        const failure = toExportFailure(error);
        const context = [
          `code=${failure.error?.code}`,
          failure.requestId ? `requestId=${failure.requestId}` : null,
          failure.error?.details !== void 0 ? `details=${JSON.stringify(failure.error.details)}` : null
        ].filter(Boolean).join(" ");
        console.error(
          `[FiveMesh SDK] Export "${name}" failed: ${failure.error?.message} (${context})`
        );
        return failure;
      }
    };
  }

  // src/client/index.ts
  var TAKE_IMAGE_EVENT = "fivemesh:sdk:takeImage";
  function takeImage(metadata, options) {
    return callServer(TAKE_IMAGE_EVENT, { metadata, options });
  }
  function uploadImage(data, metadata, options) {
    return callServer("fivemesh:sdk:uploadImageData", {
      data,
      metadata,
      options
    });
  }
  exports("takeImage", wrapExport("takeImage", takeImage));
  exports("uploadImage", wrapExport("uploadImage", uploadImage));
})();
