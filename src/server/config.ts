const DEFAULT_API_BASE_URL = "https://api.fivemesh.io/v1";

function readConvar(name: string, fallback = ""): string {
  return GetConvar(name, fallback).trim();
}

export function getApiBaseUrl(): string {
  return (
    readConvar("FIVEMESH_API_URL") ||
    readConvar("FIVEMESH_API_BASE_URL") ||
    DEFAULT_API_BASE_URL
  ).replace(/\/+$/g, "");
}

export function getApiKey(keyProfile?: string): string {
  if (keyProfile) {
    const profileConvar = `FIVEMESH_API_KEY_${keyProfile}`;
    const profileKey = readConvar(profileConvar);

    if (!profileKey) {
      throw new Error(
        `Missing FiveMesh API key profile "${keyProfile}". Add \`set ${profileConvar} fm_live_...\` to server.cfg, or remove \`keyProfile = "${keyProfile}"\` from this SDK call.`,
      );
    }

    return profileKey;
  }

  const key =
    readConvar("FIVEMESH_API_KEY") ||
    readConvar("FIVEMESH_CDN_API_KEY") ||
    readConvar("FIVEMESH_SERVICE_API_KEY");

  if (!key) {
    throw new Error(
      "Missing FiveMesh API key. Add `set FIVEMESH_API_KEY fm_live_...` to server.cfg.",
    );
  }

  return key;
}

export function assertRequiredConfig(): void {
  getApiKey();
}

export function getDebugEnabled(): boolean {
  return ["1", "true", "yes", "on"].includes(
    readConvar("FIVEMESH_SDK_DEBUG").toLowerCase(),
  );
}

export function getBearerToken(keyProfile?: string): string {
  const key = getApiKey(keyProfile);
  return key.toLowerCase().startsWith("bearer ") ? key : `Bearer ${key}`;
}
