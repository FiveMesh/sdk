import type { PlayerIdentifiers } from "./types";

const IDENTIFIER_KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
const MAX_IDENTIFIER_COUNT = 16;
const MAX_IDENTIFIER_VALUE_LENGTH = 256;

export function formatPlayerIdentifiers(
  rawIdentifiers: string[],
  excluded = new Set<string>(),
): PlayerIdentifiers {
  const identifiers: PlayerIdentifiers = {};

  for (const rawIdentifier of rawIdentifiers) {
    if (Object.keys(identifiers).length >= MAX_IDENTIFIER_COUNT) break;
    const separator = rawIdentifier.indexOf(":");
    if (separator <= 0) continue;

    const key = rawIdentifier.slice(0, separator).toLowerCase();
    const value = rawIdentifier.slice(separator + 1);
    if (
      !IDENTIFIER_KEY_PATTERN.test(key) ||
      excluded.has(key) ||
      !value ||
      value.length > MAX_IDENTIFIER_VALUE_LENGTH
    ) {
      continue;
    }
    identifiers[key] = value;
  }

  return identifiers;
}
