export type Metadata = Record<string, unknown>;

export type ApiEnvelope = {
  success: boolean;
  requestId?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type CdnObject = {
  key: string;
  size: number;
  contentType?: string;
  etag?: string;
  lastModified?: string | null;
  metadata?: Metadata;
  publicUrl?: string;
};

export type UploadedObject = CdnObject;

export type ListObjectsOptions = {
  path?: string;
  limit?: number;
  continuationToken?: string;
  keyProfile?: string;
};

export type ListObjectsResponse = ApiEnvelope & {
  objects: CdnObject[];
  continuationToken: string | null;
};

export type UploadOptions = {
  path?: string;
  filename?: string;
  metadata?: Metadata;
  contentType?: string;
  dataEncoding?: "utf8" | "base64" | "binary";
  idempotencyKey?: string;
  keyProfile?: string;
};

export type UploadFileInput =
  | ArrayBuffer
  | Uint8Array
  | string
  | Blob;

export type UploadObjectResponse = ApiEnvelope & {
  object: UploadedObject;
};

export type BulkUploadItem = {
  data: UploadFileInput;
  filename?: string;
  path?: string;
  metadata?: Metadata;
  contentType?: string;
  dataEncoding?: "utf8" | "base64" | "binary";
};

export type BulkUploadResult = {
  success: boolean;
  fieldName: string;
  key?: string;
  size?: number;
  publicUrl?: string;
  error?: string;
};

export type BulkUploadResponse = ApiEnvelope & {
  results: BulkUploadResult[];
};

export type DeleteObjectResponse = ApiEnvelope & {
  key: string;
  status: "deleted" | "not_found" | string;
};

export type BulkDeleteResult = {
  success: boolean;
  path: string;
  key?: string;
  status?: string;
  error?: string;
};

export type BulkDeleteResponse = ApiEnvelope & {
  results: BulkDeleteResult[];
};

export type PurgeObjectsResponse = ApiEnvelope & {
  paths: string[];
  purged: number;
};

export type PresignedUrlOptions = {
  expiresIn?: number;
  path?: string;
  maxFiles?: number;
  maxFileSize?: number;
  allowedMimeTypes?: string[];
  allowCustomMetadata?: boolean;
  keyProfile?: string;
};

export type PresignedUrlResponse = ApiEnvelope & {
  uploadUrl: string;
  method: "POST";
  token: string;
  expiresAt: string;
  maxFiles: number;
  maxFileSize: number;
  allowedMimeTypes: string[] | null;
  allowCustomMetadata: boolean;
  path: string | null;
};

export type ScreenshotOptions = UploadOptions & {
  quality?: number;
  encoding?: "png" | "jpg" | "webp";
};

export type RpcResponse<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string;
    };
