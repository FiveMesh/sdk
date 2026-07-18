import {
  bulkDelete,
  bulkUpload,
  createPresignedUrl,
  deleteObject,
  listObjects,
  purgeObjects,
  uploadFile,
  uploadImage,
  uploadWithPresignedUrl,
} from "./api";
import { assertRequiredConfig, getApiBaseUrl, getDebugEnabled } from "./config";
import { registerRpc } from "./rpc";
import { takeImageFromRpc, takeServerImage, uploadImageData } from "./screenshots";
import { wrapExport } from "../shared/exports";
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

exports("listObjects", wrapExport("listObjects", listObjects));
exports("uploadFile", wrapExport("uploadFile", uploadFile));
exports("uploadImage", wrapExport("uploadImage", uploadImage));
exports("bulkUpload", wrapExport("bulkUpload", bulkUpload));
exports("deleteObject", wrapExport("deleteObject", deleteObject));
exports("bulkDelete", wrapExport("bulkDelete", bulkDelete));
exports("purgeObjects", wrapExport("purgeObjects", purgeObjects));
exports("createPresignedUrl", wrapExport("createPresignedUrl", createPresignedUrl));
exports(
  "uploadWithPresignedUrl",
  wrapExport("uploadWithPresignedUrl", uploadWithPresignedUrl),
);
exports("takeServerImage", wrapExport("takeServerImage", takeServerImage));

if (getDebugEnabled()) {
  console.log(`[FiveMesh SDK] Ready. API base URL: ${getApiBaseUrl()}`);
} else {
  console.log("[FiveMesh SDK] Ready.");
}
