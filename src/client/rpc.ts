import type { RpcResponse } from "../shared/types";

const RPC_TIMEOUT_MS = 20000;
let rpcCounter = 0;

export function callServer<TInput, TOutput>(
  eventName: string,
  payload: TInput,
  timeoutMs = RPC_TIMEOUT_MS,
): Promise<TOutput> {
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const responseEvent = `${eventName}:response:${GetPlayerServerId(PlayerId())}:${rpcCounter++}:${Math.random()
      .toString(36)
      .slice(2)}`;

    const timeout = setTimeout(() => {
      timedOut = true;
      removeEventListener(responseEvent, handleResponse);
      reject(new Error(`FiveMesh RPC "${eventName}" timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    function handleResponse(response: RpcResponse<TOutput>) {
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
