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
