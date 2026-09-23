import { FiveMeshApiError } from "../shared/errors";
import type { ApiEnvelope } from "../shared/types";
import { getApiBaseUrl, getLogsServerId } from "./config";
import { requestJson } from "./http";

export type ApiKeyIdentity = {
  allowedMimeTypes: string[] | null;
  keyId: string;
  organization: { id: string; name: string | null };
  permissions: Record<string, string[]>;
  restrictions: { allowedPrefixes: string[]; deniedPrefixes: string[] };
  server: { cfxId: string; hostname: string | null; name: string | null } | null;
};

type WhoamiResponse = ApiEnvelope & Partial<ApiKeyIdentity>;

/**
 * Describes the configured API key: its Organization, its Server binding and
 * its permissions. Throws a `FiveMeshApiError` when the key is rejected.
 */
export async function whoami(): Promise<ApiKeyIdentity> {
  const { success: _success, requestId: _requestId, error: _error, ...identity } =
    await requestJson<WhoamiResponse>(getApiBaseUrl(), "/whoami", {
      timeoutMs: 10_000,
    });
  void _success;
  void _requestId;
  void _error;
  return {
    allowedMimeTypes: identity.allowedMimeTypes ?? null,
    keyId: identity.keyId ?? "unknown",
    organization: identity.organization ?? { id: "unknown", name: null },
    permissions: identity.permissions ?? {},
    restrictions: identity.restrictions ?? { allowedPrefixes: [], deniedPrefixes: [] },
    server: identity.server ?? null,
  };
}

function describePermissions(identity: ApiKeyIdentity, service: string) {
  const actions = identity.permissions[service];
  return Array.isArray(actions) && actions.length ? actions.join(", ") : "none";
}

/**
 * Startup check. It never throws: a server must still boot when FiveMesh is
 * unreachable, but a misconfigured key or a missing server id is stated loudly.
 */
export async function logApiKeyIdentity(): Promise<void> {
  let identity: ApiKeyIdentity;
  try {
    identity = await whoami();
  } catch (error) {
    if (error instanceof FiveMeshApiError) {
      console.error(
        `[FiveMesh SDK] API key check failed: ${error.message} (code=${error.code} requestId=${error.requestId ?? "unknown"}). ` +
          "Verify the key in the FiveMesh dashboard and that it is enabled.",
      );
      return;
    }
    console.error(
      `[FiveMesh SDK] API key check failed: the FiveMesh API is unreachable (${
        error instanceof Error ? error.message : String(error)
      }).`,
    );
    return;
  }

  const organization = identity.organization.name
    ? `${identity.organization.name} (${identity.organization.id})`
    : identity.organization.id;
  const configuredServerId = getLogsServerId();

  if (!identity.server) {
    if (configuredServerId) {
      console.warn(
        `[FiveMesh SDK] API key is global to ${organization}; Logs features use FIVEMESH_SERVER_ID "${configuredServerId}".`,
      );
      return;
    }
    console.error(
      `[FiveMesh SDK] API key is global to ${organization} and no server is configured. ` +
        'Logs ingestion and queries need `set FIVEMESH_SERVER_ID "your-cfx-server-id"`, or a key that is specific to this server.',
    );
    return;
  }

  if (configuredServerId && configuredServerId !== identity.server.cfxId) {
    console.warn(
      `[FiveMesh SDK] API key is bound to server "${identity.server.cfxId}" but FIVEMESH_SERVER_ID is "${configuredServerId}". ` +
        "The binding wins; requests for another server are refused.",
    );
  }

  const server = identity.server.name
    ? `${identity.server.name} (${identity.server.cfxId})`
    : identity.server.cfxId;
  console.log(
    `[FiveMesh SDK] API key ready. Organization: ${organization}. Server: ${server}. ` +
      `Logs: ${describePermissions(identity, "logs")}. CDN: ${describePermissions(identity, "cdn")}.`,
  );
}
