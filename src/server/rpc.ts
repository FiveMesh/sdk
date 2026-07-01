import { getErrorMessage } from "../shared/errors";
import type { RpcResponse } from "../shared/types";

type RpcHandler<TInput, TOutput> = (
  playerSource: number,
  payload: TInput,
) => Promise<TOutput> | TOutput;

export function registerRpc<TInput, TOutput>(
  eventName: string,
  handler: RpcHandler<TInput, TOutput>,
) {
  onNet(eventName, (responseEvent: string, payload: TInput) => {
    const playerSource = global.source;

    Promise.resolve(handler(playerSource, payload))
      .then((data) => {
        emitNet(responseEvent, playerSource, {
          success: true,
          data,
        } satisfies RpcResponse<TOutput>);
      })
      .catch((error) => {
        emitNet(responseEvent, playerSource, {
          success: false,
          error: getErrorMessage(error),
        } satisfies RpcResponse<TOutput>);
      });
  });
}
