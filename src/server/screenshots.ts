import { uploadImage } from "./api";
import type {
  ScreenshotOptions,
  UploadObjectResponse,
  UploadOptions,
} from "../shared/types";

type ScreenshotPayload = {
  metadata?: Record<string, unknown>;
  options?: ScreenshotOptions;
};

function ensureScreenshotBasic() {
  const screenshot = exports["screenshot-basic"];
  if (!screenshot?.requestClientScreenshot) {
    throw new Error(
      "screenshot-basic is required for FiveMesh screenshot exports.",
    );
  }
  return screenshot as {
    requestClientScreenshot: (
      playerSource: string | number,
      options: Record<string, unknown>,
      callback: (error: false | string, data: string) => void,
    ) => void;
  };
}

export function takeServerImage(
  playerSource: string | number,
  metadata?: Record<string, unknown>,
  options: ScreenshotOptions = {},
  timeoutMs = 15000,
): Promise<UploadObjectResponse> {
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
          filename: options.filename ?? `screenshot.${encoding}`,
        })
          .then((response) => {
            settled = true;
            clearTimeout(timeout);
            resolve(response);
          })
          .catch((uploadError) => {
            settled = true;
            clearTimeout(timeout);
            reject(uploadError);
          });
      },
    );
  });
}

export function uploadImageData(payload: {
  data: string;
  metadata?: Record<string, unknown>;
  options?: UploadOptions;
}): Promise<UploadObjectResponse> {
  return uploadImage(payload.data, payload.metadata, payload.options);
}

export function takeImageFromRpc(
  playerSource: number,
  payload: ScreenshotPayload = {},
): Promise<UploadObjectResponse> {
  return takeServerImage(playerSource, payload.metadata, payload.options);
}
