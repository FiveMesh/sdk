import { getExcludedPlayerIdentifiers } from "../config";
import type { PlayerIdentifiers } from "./types";
import { formatPlayerIdentifiers } from "./identifier-format";

const IDENTIFIER_CACHE_TTL_MS = 5 * 60 * 1_000;
const MAX_CACHED_PLAYERS = 512;

type CachedIdentifiers = {
  identifiers: PlayerIdentifiers;
  capturedAt: number;
};

const identifierCache = new Map<string, CachedIdentifiers>();
let lifecycleRegistered = false;

export function getPlayerIdentifiers(
  playerId: string | number,
  options: { force?: boolean } = {},
): PlayerIdentifiers {
  const source = normalizePlayerId(playerId);
  const cached = identifierCache.get(source);
  if (
    !options.force &&
    cached &&
    Date.now() - cached.capturedAt < IDENTIFIER_CACHE_TTL_MS
  ) {
    return { ...cached.identifiers };
  }

  const rawIdentifiers: string[] = [];
  try {
    const count = GetNumPlayerIdentifiers(source);
    for (let index = 0; index < count; index += 1) {
      const identifier = GetPlayerIdentifier(source, index);
      if (identifier) rawIdentifiers.push(identifier);
    }
  } catch {
    cacheIdentifiers(source, {});
    return {};
  }

  const identifiers = formatPlayerIdentifiers(
    rawIdentifiers,
    getExcludedPlayerIdentifiers(),
  );
  cacheIdentifiers(source, identifiers);
  return { ...identifiers };
}

export function clearPlayerIdentifiers(playerId: string | number): void {
  identifierCache.delete(normalizePlayerId(playerId));
}

export function movePlayerIdentifiers(
  previousPlayerId: string | number,
  nextPlayerId: string | number,
): void {
  const previous = identifierCache.get(normalizePlayerId(previousPlayerId));
  if (!previous) return;
  identifierCache.set(normalizePlayerId(nextPlayerId), previous);
  identifierCache.delete(normalizePlayerId(previousPlayerId));
}

export function registerIdentifierLifecycle(): void {
  if (lifecycleRegistered) return;
  lifecycleRegistered = true;

  on("playerJoining", (oldPlayerId: string) => {
    const playerId = String(global.source);
    movePlayerIdentifiers(oldPlayerId, playerId);
    getPlayerIdentifiers(playerId, { force: true });
  });

  on("playerDropped", () => {
    const playerId = String(global.source);
    setImmediate(() => clearPlayerIdentifiers(playerId));
  });
}

function cacheIdentifiers(
  playerId: string,
  identifiers: PlayerIdentifiers,
): void {
  if (identifierCache.size >= MAX_CACHED_PLAYERS) {
    const oldest = identifierCache.keys().next().value;
    if (oldest !== undefined) identifierCache.delete(oldest);
  }
  identifierCache.set(playerId, {
    identifiers,
    capturedAt: Date.now(),
  });
}

function normalizePlayerId(playerId: string | number): string {
  const normalized = String(playerId).trim();
  if (!normalized || normalized.length > 128) {
    throw new Error("Player IDs must be non-empty and at most 128 characters.");
  }
  return normalized;
}
