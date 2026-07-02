import type {
  BulkDeleteResponse,
  BulkUploadItem,
  BulkUploadResponse,
  DeleteObjectResponse,
  ListObjectsOptions,
  ListObjectsResponse,
  PresignedUrlOptions,
  PresignedUrlResponse,
  PurgeObjectsResponse,
  UploadFileInput,
  UploadObjectResponse,
  UploadOptions,
} from "../shared/types";
import { getApiBaseUrl } from "./config";
import { appendMetadata, toBlobFile } from "./files";
import { requestJson } from "./http";

function idempotencyHeaders(idempotencyKey?: string): Record<string, string> {
  return idempotencyKey ? { "idempotency-key": idempotencyKey } : {};
}

export function listObjects(
  options: ListObjectsOptions = {},
): Promise<ListObjectsResponse> {
  const { keyProfile, ...query } = options;

  return requestJson<ListObjectsResponse>(getApiBaseUrl(), "/objects", {
    query,
    keyProfile,
  });
}

export function uploadFile(
  data: UploadFileInput,
  options: UploadOptions = {},
): Promise<UploadObjectResponse> {
  const file = toBlobFile(data, {
    filename: options.filename,
    contentType: options.contentType,
  });
  const form = new FormData();
  form.append("file", file.blob, file.filename);
  if (options.filename) form.append("filename", options.filename);
  if (options.path) form.append("path", options.path);
  appendMetadata(form, options.metadata);

  return requestJson<UploadObjectResponse>(getApiBaseUrl(), "/objects", {
    method: "POST",
    body: form,
    headers: idempotencyHeaders(options.idempotencyKey),
    keyProfile: options.keyProfile,
  });
}

export function uploadImage(
  data: string,
  metadata?: Record<string, unknown>,
  options: UploadOptions = {},
): Promise<UploadObjectResponse> {
  return uploadFile(data, {
    filename: options.filename ?? "image.webp",
    ...options,
    metadata: metadata ?? options.metadata,
  });
}

export function bulkUpload(
  items: BulkUploadItem[],
  options: { idempotencyKey?: string; keyProfile?: string } = {},
): Promise<BulkUploadResponse> {
  const form = new FormData();
  const payload = {
    items: items.map((item, index) => {
      const fieldName = `files[${index}]`;
      const file = toBlobFile(item.data, {
        filename: item.filename,
        contentType: item.contentType,
      });

      form.append(fieldName, file.blob, file.filename);
      return {
        fieldName,
        filename: item.filename,
        path: item.path,
        metadata: item.metadata,
      };
    }),
  };

  form.append("payload", JSON.stringify(payload));

  return requestJson<BulkUploadResponse>(getApiBaseUrl(), "/objects/bulk", {
    method: "POST",
    body: form,
    headers: idempotencyHeaders(options.idempotencyKey),
    keyProfile: options.keyProfile,
  });
}

export function deleteObject(
  path: string,
  options: { idempotencyKey?: string; keyProfile?: string } = {},
): Promise<DeleteObjectResponse> {
  return requestJson<DeleteObjectResponse>(getApiBaseUrl(), "/objects", {
    method: "DELETE",
    query: { path },
    headers: idempotencyHeaders(options.idempotencyKey),
    keyProfile: options.keyProfile,
  });
}

export function bulkDelete(
  paths: string[],
  options: { keyProfile?: string } = {},
): Promise<BulkDeleteResponse> {
  return requestJson<BulkDeleteResponse>(getApiBaseUrl(), "/objects/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ paths }),
    headers: { "content-type": "application/json" },
    keyProfile: options.keyProfile,
  });
}

export function purgeObjects(
  paths: string[],
  options: { idempotencyKey?: string; keyProfile?: string } = {},
): Promise<PurgeObjectsResponse> {
  return requestJson<PurgeObjectsResponse>(getApiBaseUrl(), "/objects/purge", {
    method: "POST",
    body: JSON.stringify({ paths }),
    headers: {
      "content-type": "application/json",
      ...idempotencyHeaders(options.idempotencyKey),
    },
    keyProfile: options.keyProfile,
  });
}

export function createPresignedUrl(
  options: PresignedUrlOptions = {},
): Promise<PresignedUrlResponse> {
  const { keyProfile, ...query } = options;

  return requestJson<PresignedUrlResponse>(getApiBaseUrl(), "/presigned-url", {
    query,
    keyProfile,
  });
}

export function uploadWithPresignedUrl(
  uploadUrlOrToken: string,
  data: UploadFileInput,
  options: UploadOptions = {},
): Promise<UploadObjectResponse> {
  const file = toBlobFile(data, {
    filename: options.filename,
    contentType: options.contentType,
  });
  const form = new FormData();
  form.append("file", file.blob, file.filename);
  if (options.filename) form.append("filename", options.filename);
  if (options.path) form.append("path", options.path);
  appendMetadata(form, options.metadata);

  const url = uploadUrlOrToken.startsWith("http")
    ? uploadUrlOrToken
    : `${getApiBaseUrl()}/presigned-url/${uploadUrlOrToken}`;

  return requestJson<UploadObjectResponse>(url, "", {
    method: "POST",
    body: form,
    authenticated: false,
  });
}
