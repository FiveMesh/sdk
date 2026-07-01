import { FiveMeshApiError } from "../shared/errors";
import type { ApiEnvelope } from "../shared/types";
import { getBearerToken } from "./config";

type RequestOptions = {
  method?: string;
  query?: Record<string, string | number | boolean | string[] | null | undefined>;
  body?: BodyInit | null;
  headers?: Record<string, string>;
  authenticated?: boolean;
  keyProfile?: string;
};

function buildUrl(baseUrl: string, path: string, query?: RequestOptions["query"]) {
  const suffix = path === "" ? "" : path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${baseUrl}${suffix}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item);
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return url;
}

export async function requestJson<T extends ApiEnvelope>(
  baseUrl: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json",
    ...options.headers,
  };

  if (options.authenticated !== false) {
    headers.authorization = getBearerToken(options.keyProfile);
  }

  const response = await fetch(buildUrl(baseUrl, path, options.query), {
    method: options.method ?? "GET",
    headers,
    body: options.body,
  });

  const requestId = response.headers.get("x-request-id") ?? undefined;
  let payload: ApiEnvelope | null = null;

  try {
    payload = (await response.json()) as ApiEnvelope;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    const apiError = payload?.error;
    throw new FiveMeshApiError({
      code: apiError?.code ?? "REQUEST_FAILED",
      message:
        apiError?.message ??
        `FiveMesh API request failed with HTTP ${response.status}.`,
      status: response.status,
      requestId: payload?.requestId ?? requestId,
      details: apiError?.details,
    });
  }

  return payload as T;
}
