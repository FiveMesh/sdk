import type { UploadFileInput } from "../shared/types";

type FilePayload = {
  blob: Blob;
  filename: string;
};

function parseDataUrl(value: string): { bytes: Buffer; contentType?: string } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(value);
  if (!match) {
    return { bytes: Buffer.from(value) };
  }

  const [, contentType, base64Flag, body] = match;
  return {
    bytes: Buffer.from(decodeURIComponent(body ?? ""), base64Flag ? "base64" : "utf8"),
    contentType,
  };
}

export function toBlobFile(
  input: UploadFileInput,
  options: { filename?: string; contentType?: string } = {},
): FilePayload {
  if (input instanceof Blob) {
    return {
      blob: input,
      filename: options.filename ?? "file",
    };
  }

  if (typeof input === "string") {
    const parsed = parseDataUrl(input);
    return {
      blob: new Blob([new Uint8Array(parsed.bytes)], {
        type: options.contentType ?? parsed.contentType ?? "application/octet-stream",
      }),
      filename: options.filename ?? "file",
    };
  }

  const bytes =
    input instanceof Uint8Array
      ? input
      : new Uint8Array(input);
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);

  return {
    blob: new Blob([arrayBuffer], {
      type: options.contentType ?? "application/octet-stream",
    }),
    filename: options.filename ?? "file",
  };
}

export function appendMetadata(form: FormData, metadata?: Record<string, unknown>) {
  if (metadata && Object.keys(metadata).length > 0) {
    form.append("metadata", JSON.stringify(metadata));
  }
}
