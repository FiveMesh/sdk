import { getErrorMessage } from "./errors";
import type { ApiEnvelope } from "./types";

type ExportCallback<T> = (result: T | null, error?: string) => void;
type ExportHandler<TArgs extends unknown[], TResult> = (
  ...args: TArgs
) => Promise<TResult> | TResult;
type ExportFailure = ApiEnvelope & {
  success: false;
};

function isCallback<T>(value: unknown): value is ExportCallback<T> {
  return typeof value === "function";
}

function deferToNextTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function toExportFailure(error: unknown): ExportFailure {
  const apiError = error as {
    code?: unknown;
    status?: unknown;
    requestId?: unknown;
    details?: unknown;
  };

  return {
    success: false,
    requestId:
      typeof apiError.requestId === "string" ? apiError.requestId : undefined,
    error: {
      code: typeof apiError.code === "string" ? apiError.code : "SDK_EXPORT_FAILED",
      message: getErrorMessage(error),
      details: apiError.details ?? (
        typeof apiError.status === "number" ? { status: apiError.status } : undefined
      ),
    },
  };
}

export function wrapExport<TArgs extends unknown[], TResult>(
  name: string,
  handler: ExportHandler<TArgs, TResult>,
) {
  return (
    ...rawArgs: [...TArgs, ExportCallback<TResult | ExportFailure>?]
  ): Promise<TResult | ExportFailure> | null => {
    const maybeCallback = rawArgs[rawArgs.length - 1];
    const callback = isCallback<TResult | ExportFailure>(maybeCallback)
      ? maybeCallback
      : undefined;
    const args = (callback ? rawArgs.slice(0, -1) : rawArgs) as TArgs;

    const promise = deferToNextTick()
      .then(() => handler(...args))
      .catch((error) => {
        const failure = toExportFailure(error);
        console.error(
          `[FiveMesh SDK] Export "${name}" failed: ${failure.error?.message}`,
        );
        return failure;
      });

    if (!callback) {
      return promise;
    }

    promise.then((result) => {
      if ((result as ApiEnvelope).success === false) {
        callback(null, (result as ExportFailure).error?.message);
        return;
      }

      callback(result);
    });

    return null;
  };
}
