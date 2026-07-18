import { getErrorMessage } from "./errors";
import type { ApiEnvelope } from "./types";

type ExportHandler<TArgs extends unknown[], TResult> = (
  ...args: TArgs
) => Promise<TResult> | TResult;
type ExportFailure = ApiEnvelope & { success: false };

function toExportFailure(error: unknown): ExportFailure {
  const apiError = error as {
    code?: unknown;
    status?: unknown;
    requestId?: unknown;
    details?: unknown;
  };
  const failure: ExportFailure = {
    success: false,
    error: {
      code: typeof apiError.code === "string" ? apiError.code : "SDK_EXPORT_FAILED",
      message: getErrorMessage(error),
    },
  };

  if (typeof apiError.requestId === "string") {
    failure.requestId = apiError.requestId;
  }
  if (apiError.details !== undefined) {
    failure.error!.details = apiError.details;
  } else if (typeof apiError.status === "number") {
    failure.error!.details = { status: apiError.status };
  }

  return failure;
}

export function wrapExport<TArgs extends unknown[], TResult>(
  name: string,
  handler: ExportHandler<TArgs, TResult>,
) {
  return async (...args: TArgs): Promise<TResult | ExportFailure> => {
    try {
      return await handler(...args);
    } catch (error) {
      const failure = toExportFailure(error);
      console.error(
        `[FiveMesh SDK] Export "${name}" failed: ${failure.error?.message}`,
      );
      return failure;
    }
  };
}
