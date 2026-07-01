import { callServer } from "./rpc";
import type {
  ScreenshotOptions,
  UploadObjectResponse,
  UploadOptions,
} from "../shared/types";

const TAKE_IMAGE_EVENT = "fivemesh:sdk:takeImage";

function takeImage(
  metadata?: Record<string, unknown>,
  options?: ScreenshotOptions,
): Promise<UploadObjectResponse> {
  return callServer(TAKE_IMAGE_EVENT, { metadata, options });
}

function uploadImage(
  data: string,
  metadata?: Record<string, unknown>,
  options?: UploadOptions,
): Promise<UploadObjectResponse> {
  return callServer("fivemesh:sdk:uploadImageData", {
    data,
    metadata,
    options,
  });
}

exports("takeImage", takeImage);
exports("uploadImage", uploadImage);
