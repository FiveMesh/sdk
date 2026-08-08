import type { LogLevel, LogOptions } from "./types";

export type AutomaticLogWriter = (
  level: LogLevel,
  message: string,
  options: LogOptions,
) => void;

let coreRegistered = false;
let baseEventsRegistered = false;
const BASE_EVENT_MIN_INTERVAL_MS = 5_000;
const baseEventThrottle = createAutomaticEventThrottle(
  BASE_EVENT_MIN_INTERVAL_MS,
);

export function createAutomaticEventThrottle(minimumIntervalMs: number) {
  const lastAcceptedAt = new Map<string, number>();

  return {
    accept(playerId: string, now = Date.now()) {
      const previous = lastAcceptedAt.get(playerId);
      if (
        previous !== undefined &&
        now - previous < Math.max(0, minimumIntervalMs)
      ) {
        return false;
      }
      lastAcceptedAt.set(playerId, now);
      return true;
    },
    clear(playerId: string) {
      lastAcceptedAt.delete(playerId);
    },
  };
}

export function startAutomaticLogging(
  write: AutomaticLogWriter,
  options: { baseEvents: boolean; core: boolean },
): void {
  if (options.core && !coreRegistered) {
    coreRegistered = true;
    registerCoreEvents(write);
  }
  if (options.baseEvents && !baseEventsRegistered) {
    baseEventsRegistered = true;
    registerBaseEvents(write);
  }
}

function registerCoreEvents(write: AutomaticLogWriter): void {
  on("playerConnecting", (playerName: string) => {
    const playerId = String(global.source);
    write("info", `Player ${playerName} is connecting`, {
      eventType: "player.connecting",
      playerId,
      resource: "fivem",
      data: {
        player_name: playerName,
      },
    });
  });

  on("playerJoining", (oldPlayerId: string) => {
    const playerId = String(global.source);
    const playerName = GetPlayerName(playerId) || "Unknown";
    write("info", `Player ${playerName} joined`, {
      eventType: "player.joined",
      playerId,
      resource: "fivem",
      data: {
        player_name: playerName,
        previous_player_id: oldPlayerId,
      },
    });
  });

  on(
    "playerDropped",
    (reason: string, resourceName?: string, clientDropReason?: number) => {
      const playerId = String(global.source);
      const playerName = GetPlayerName(playerId) || "Unknown";
      write("info", `Player ${playerName} disconnected`, {
        eventType: "player.disconnected",
        playerId,
        resource: "fivem",
        data: {
          player_name: playerName,
          reason,
          resource_name: resourceName,
          client_drop_reason: clientDropReason,
        },
      });
    },
  );
}

function registerBaseEvents(write: AutomaticLogWriter): void {
  on("playerDropped", () => {
    baseEventThrottle.clear(String(global.source));
  });

  on(
    "baseevents:onPlayerDied",
    (killerType: number, deathCoordinates: unknown) => {
      const playerId = String(global.source);
      if (!baseEventThrottle.accept(playerId)) return;
      const playerName = GetPlayerName(playerId) || "Unknown";
      write("info", `Player ${playerName} died`, {
        eventType: "player.died",
        playerId,
        resource: "baseevents",
        data: {
          event_trust: "client_reported",
          player_name: playerName,
          killer_type: killerType,
          death_coordinates: compactJsonValue(deathCoordinates),
        },
      });
    },
  );

  on(
    "baseevents:onPlayerKilled",
    (killerId: number, deathData: Record<string, unknown> | undefined) => {
      const victimId = String(global.source);
      if (!baseEventThrottle.accept(victimId)) return;
      const killerPlayerId =
        Number.isInteger(killerId) && killerId >= 0
          ? String(killerId)
          : undefined;
      const victimName = GetPlayerName(victimId) || "Unknown";
      const killerName = killerPlayerId
        ? GetPlayerName(killerPlayerId) || "Unknown"
        : "Unknown";

      write("info", `Player ${victimName} was killed by ${killerName}`, {
        eventType: "player.killed",
        playerId: killerPlayerId ?? victimId,
        targetPlayerId: killerPlayerId ? victimId : undefined,
        resource: "baseevents",
        data: {
          event_trust: "client_reported",
          victim_name: victimName,
          killer_name: killerName,
          killer_type: deathData?.killertype,
          weapon_hash: deathData?.weaponhash,
          killer_in_vehicle: deathData?.killerinveh,
          killer_vehicle_name: deathData?.killervehname,
          killer_vehicle_seat: deathData?.killervehseat,
          killer_position: compactJsonValue(deathData?.killerpos),
        },
      });
    },
  );
}

function compactJsonValue(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= 2_048) return JSON.parse(serialized) as unknown;
    return {
      truncated: true,
      preview: serialized.slice(0, 2_048),
    };
  } catch {
    return String(value);
  }
}
