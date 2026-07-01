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
  exports("takeImage", takeImage);
  exports("uploadImage", uploadImage);
})();
