import {
  bulkDelete,
  bulkUpload,
  createPresignedUrl,
  deleteObject,
  listObjects,
  uploadFile,
  uploadImage,
  uploadWithPresignedUrl,
} from "./api";
import { assertRequiredConfig, getApiBaseUrl, getDebugEnabled } from "./config";
import { registerRpc } from "./rpc";
import { takeImageFromRpc, takeServerImage, uploadImageData } from "./screenshots";
import type { UploadObjectResponse, UploadOptions } from "../shared/types";

try {
  assertRequiredConfig();
} catch (error) {
  console.error(
    `[FiveMesh SDK] Configuration check failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  throw error;
}

registerRpc("fivemesh:sdk:takeImage", takeImageFromRpc);
registerRpc<
  { data: string; metadata?: Record<string, unknown>; options?: UploadOptions },
  UploadObjectResponse
>("fivemesh:sdk:uploadImageData", (_source, payload) =>
  uploadImageData(payload),
);

exports("listObjects", listObjects);
exports("uploadFile", uploadFile);
exports("uploadImage", uploadImage);
exports("bulkUpload", bulkUpload);
exports("deleteObject", deleteObject);
exports("bulkDelete", bulkDelete);
exports("createPresignedUrl", createPresignedUrl);
exports("uploadWithPresignedUrl", uploadWithPresignedUrl);
exports("takeServerImage", takeServerImage);

if (getDebugEnabled()) {
  console.log(`[FiveMesh SDK] Ready. API base URL: ${getApiBaseUrl()}`);
} else {
  console.log("[FiveMesh SDK] Ready.");
}
