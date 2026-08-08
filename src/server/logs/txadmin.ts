import { getExcludedPlayerIdentifiers } from "../config";
import type { AutomaticLogWriter } from "./automatic";
import { formatPlayerIdentifiers } from "./identifier-format";
import type {
  LogLevel,
  LogOptions,
  PlayerIdentifiers,
} from "./types";

const TXADMIN_EVENTS = [
  "announcement",
  "serverShuttingDown",
  "scheduledRestart",
  "scheduledRestartSkipped",
  "playerBanned",
  "playerDirectMessage",
  "playerHealed",
  "playerKicked",
  "playerWarned",
  "whitelistPlayer",
  "whitelistPreApproval",
  "whitelistRequest",
  "actionRevoked",
  "adminAuth",
  "adminsUpdated",
  "configChanged",
  "consoleCommand",
] as const;

type TxAdminEventName = (typeof TXADMIN_EVENTS)[number];

export type TxAdminAutomaticLog = {
  level: LogLevel;
  message: string;
  options: LogOptions;
};

let registered = false;

export function startTxAdminLogging(write: AutomaticLogWriter): void {
  if (registered) return;
  registered = true;

  for (const eventName of TXADMIN_EVENTS) {
    on(`txAdmin:events:${eventName}`, (eventData: unknown) => {
      try {
        const log = buildTxAdminLog(
          eventName,
          eventData,
          getExcludedPlayerIdentifiers(),
        );
        if (log) write(log.level, log.message, log.options);
      } catch (error) {
        console.error(
          `[FiveMesh SDK] txAdmin event "${eventName}" was skipped: ${getErrorMessage(error)}`,
        );
      }
    });
  }

  console.log("[FiveMesh SDK] txAdmin automatic logging attached.");
}

export function buildTxAdminLog(
  eventName: TxAdminEventName,
  eventData: unknown,
  excludedIdentifiers = new Set<string>(),
): TxAdminAutomaticLog | null {
  const data = isRecord(eventData) ? eventData : {};
  const baseData = {
    event_source: "txadmin",
  };

  switch (eventName) {
    case "announcement": {
      const author = displayString(data.author, "txAdmin");
      const announcement = displayString(data.message, "Announcement");
      return txAdminLog(
        "info",
        `txAdmin announcement from ${author}: ${announcement}`,
        "txadmin.announcement",
        {
          ...baseData,
          author,
          message: optionalString(data.message),
        },
      );
    }

    case "serverShuttingDown": {
      const author = displayString(data.author, "txAdmin");
      return txAdminLog(
        "warn",
        `Server shutdown initiated by ${author}`,
        "txadmin.server.shutting_down",
        {
          ...baseData,
          author,
          delay_ms: finiteNumber(data.delay),
          message: optionalString(data.message),
        },
      );
    }

    case "scheduledRestart": {
      const secondsRemaining = finiteNumber(data.secondsRemaining);
      return txAdminLog(
        "warn",
        secondsRemaining === undefined
          ? "Scheduled server restart approaching"
          : `Scheduled server restart in ${formatDuration(secondsRemaining)}`,
        "txadmin.server.scheduled_restart",
        {
          ...baseData,
          seconds_remaining: secondsRemaining,
          translated_message: optionalString(data.translatedMessage),
        },
      );
    }

    case "scheduledRestartSkipped": {
      const author = displayString(data.author, "txAdmin admin");
      return txAdminLog(
        "info",
        `Scheduled server restart skipped by ${author}`,
        "txadmin.server.scheduled_restart_skipped",
        {
          ...baseData,
          author,
          seconds_remaining: finiteNumber(data.secondsRemaining),
          temporary: optionalBoolean(data.temporary),
        },
      );
    }

    case "playerBanned": {
      const targetPlayerId = playerId(data.targetNetId);
      const targetName = displayString(
        data.targetName,
        targetPlayerId ? `player ${targetPlayerId}` : "identifiers",
      );
      const author = displayString(data.author, "txAdmin admin");
      return txAdminLog(
        "warn",
        `${targetName} was banned by ${author}`,
        "txadmin.player.banned",
        {
          ...baseData,
          action_id: primitiveValue(data.actionId),
          author,
          duration_input: optionalString(data.durationInput),
          duration_translated: optionalString(data.durationTranslated),
          expiration: primitiveValue(data.expiration),
          hardware_identifier_count: arrayLength(data.targetHwids),
          kick_message: optionalString(data.kickMessage),
          reason: optionalString(data.reason),
          target_name: targetName,
        },
        {
          targetPlayerId,
          targetPlayerIdentifiers: identifiersFrom(
            data.targetIds,
            excludedIdentifiers,
          ),
        },
      );
    }

    case "playerDirectMessage": {
      const targetPlayerId = playerId(data.target);
      const author = displayString(data.author, "txAdmin admin");
      return txAdminLog(
        "info",
        `${author} sent a direct message to player ${targetPlayerId ?? "unknown"}`,
        "txadmin.player.direct_message",
        {
          ...baseData,
          author,
          message: optionalString(data.message),
        },
        { targetPlayerId },
      );
    }

    case "playerHealed": {
      const targetPlayerId = playerId(data.target);
      const author = displayString(data.author, "txAdmin admin");
      return txAdminLog(
        "info",
        targetPlayerId
          ? `Player ${targetPlayerId} was healed by ${author}`
          : `All players were healed by ${author}`,
        "txadmin.player.healed",
        {
          ...baseData,
          author,
          all_players: targetPlayerId === undefined,
        },
        { targetPlayerId },
      );
    }

    case "playerKicked": {
      const targetPlayerId = playerId(data.target);
      const author = displayString(data.author, "txAdmin admin");
      return txAdminLog(
        "warn",
        targetPlayerId
          ? `Player ${targetPlayerId} was kicked by ${author}`
          : `All players were kicked by ${author}`,
        "txadmin.player.kicked",
        {
          ...baseData,
          all_players: targetPlayerId === undefined,
          author,
          drop_message: optionalString(data.dropMessage),
          reason: optionalString(data.reason),
        },
        { targetPlayerId },
      );
    }

    case "playerWarned": {
      const targetPlayerId = playerId(data.targetNetId);
      const targetName = displayString(
        data.targetName,
        targetPlayerId ? `player ${targetPlayerId}` : "offline player",
      );
      const author = displayString(data.author, "txAdmin admin");
      return txAdminLog(
        "warn",
        `${targetName} was warned by ${author}`,
        "txadmin.player.warned",
        {
          ...baseData,
          action_id: primitiveValue(data.actionId),
          author,
          reason: optionalString(data.reason),
          target_name: targetName,
        },
        {
          targetPlayerId,
          targetPlayerIdentifiers: identifiersFrom(
            data.targetIds,
            excludedIdentifiers,
          ),
        },
      );
    }

    case "whitelistPlayer": {
      const action = displayString(data.action, "updated");
      const playerName = displayString(data.playerName, "Player");
      const adminName = displayString(data.adminName, "txAdmin admin");
      return txAdminLog(
        "info",
        `${playerName} whitelist access was ${action} by ${adminName}`,
        "txadmin.whitelist.player_updated",
        {
          ...baseData,
          action,
          admin_name: adminName,
          player_name: playerName,
        },
        {
          targetPlayerIdentifiers: licenseIdentifier(
            data.license,
            excludedIdentifiers,
          ),
        },
      );
    }

    case "whitelistPreApproval": {
      const action = displayString(data.action, "updated");
      const adminName = displayString(data.adminName, "txAdmin admin");
      return txAdminLog(
        "info",
        `Whitelist pre-approval was ${action} by ${adminName}`,
        "txadmin.whitelist.preapproval_updated",
        {
          ...baseData,
          action,
          admin_name: adminName,
          player_name: optionalString(data.playerName),
        },
        {
          targetPlayerIdentifiers: identifiersFrom(
            [data.identifier],
            excludedIdentifiers,
          ),
        },
      );
    }

    case "whitelistRequest": {
      const action = displayString(data.action, "updated");
      const playerName = displayString(data.playerName, "Whitelist request");
      return txAdminLog(
        "info",
        `${playerName} was ${action}`,
        "txadmin.whitelist.request_updated",
        {
          ...baseData,
          action,
          admin_name: optionalString(data.adminName),
          player_name: optionalString(data.playerName),
          request_id: primitiveValue(data.requestId),
        },
        {
          targetPlayerIdentifiers: licenseIdentifier(
            data.license,
            excludedIdentifiers,
          ),
        },
      );
    }

    case "actionRevoked": {
      const actionType = displayString(data.actionType, "action");
      const playerName = displayString(data.playerName, "player");
      const revokedBy = displayString(data.revokedBy, "txAdmin admin");
      return txAdminLog(
        "info",
        `${actionType} for ${playerName} was revoked by ${revokedBy}`,
        "txadmin.action.revoked",
        {
          ...baseData,
          action_author: optionalString(data.actionAuthor),
          action_id: primitiveValue(data.actionId),
          action_reason: optionalString(data.actionReason),
          action_type: actionType,
          hardware_identifier_count: arrayLength(data.playerHwids),
          player_name: optionalString(data.playerName),
          revoked_by: revokedBy,
        },
        {
          targetPlayerIdentifiers: identifiersFrom(
            data.playerIds,
            excludedIdentifiers,
          ),
        },
      );
    }

    case "adminAuth": {
      const playerIdValue = playerId(data.netid);
      const authenticated = data.isAdmin === true;
      const username = displayString(data.username, "Admin");
      return txAdminLog(
        "info",
        playerIdValue
          ? `${username} ${authenticated ? "authenticated" : "lost authentication"} in game`
          : "All txAdmin in-game authentications were revoked",
        "txadmin.admin.auth_changed",
        {
          ...baseData,
          all_admins: playerIdValue === undefined,
          is_admin: authenticated,
          username: optionalString(data.username),
        },
        { playerId: playerIdValue },
      );
    }

    case "adminsUpdated": {
      return txAdminLog(
        "info",
        "txAdmin administrator configuration was updated",
        "txadmin.admins.updated",
        {
          ...baseData,
          online_admin_count: arrayLength(eventData),
        },
      );
    }

    case "configChanged": {
      return txAdminLog(
        "info",
        "txAdmin server configuration changed",
        "txadmin.config.changed",
        baseData,
      );
    }

    case "consoleCommand": {
      const author = displayString(data.author, "txAdmin admin");
      const command = commandSummary(data.command);
      return txAdminLog(
        "info",
        `${author} executed the ${command.name ?? "unknown"} console command`,
        "txadmin.console.command",
        {
          ...baseData,
          arguments_redacted: command.argumentsRedacted,
          author,
          channel: optionalString(data.channel),
          command_name: command.name,
        },
      );
    }

    default:
      return null;
  }
}

function txAdminLog(
  level: LogLevel,
  message: string,
  eventType: string,
  data: Record<string, unknown>,
  player: Pick<
    LogOptions,
    | "playerId"
    | "playerIdentifiers"
    | "targetPlayerId"
    | "targetPlayerIdentifiers"
  > = {},
): TxAdminAutomaticLog {
  return {
    level,
    message: truncate(message, 2_048),
    options: {
      eventType,
      resource: "txadmin",
      data,
      ...player,
    },
  };
}

function identifiersFrom(
  value: unknown,
  excludedIdentifiers: Set<string>,
): PlayerIdentifiers | undefined {
  const values = Array.isArray(value) ? value : [];
  const identifiers = formatPlayerIdentifiers(
    values.filter((entry): entry is string => typeof entry === "string"),
    excludedIdentifiers,
  );
  return Object.keys(identifiers).length > 0 ? identifiers : undefined;
}

function licenseIdentifier(
  value: unknown,
  excludedIdentifiers: Set<string>,
): PlayerIdentifiers | undefined {
  if (excludedIdentifiers.has("license")) return undefined;
  const license = optionalString(value, 256);
  if (!license) return undefined;
  const normalized = license.startsWith("license:")
    ? license.slice("license:".length)
    : license;
  if (!normalized) return undefined;
  return {
    license: normalized,
  };
}

function playerId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return String(value);
  }
  if (
    typeof value === "string" &&
    /^\d+$/.test(value) &&
    Number(value) >= 0
  ) {
    return value;
  }
  return undefined;
}

function commandSummary(value: unknown): {
  argumentsRedacted: boolean;
  name?: string;
} {
  const command = optionalString(value, 2_048)?.trim();
  if (!command) return { argumentsRedacted: false };
  const separator = command.search(/[\s=]/);
  return {
    argumentsRedacted: separator >= 0,
    name: truncate(separator >= 0 ? command.slice(0, separator) : command, 128),
  };
}

function formatDuration(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

function optionalString(
  value: unknown,
  maximumLength = 1_024,
): string | undefined {
  return typeof value === "string" && value.trim()
    ? truncate(value, maximumLength)
    : undefined;
}

function displayString(value: unknown, fallback: string): string {
  return optionalString(value, 256) ?? fallback;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function primitiveValue(
  value: unknown,
): string | number | boolean | null {
  if (typeof value === "string") return truncate(value, 1_024);
  return typeof value === "number" || typeof value === "boolean"
    ? value
    : null;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function truncate(value: string, maximumLength: number): string {
  return value.length <= maximumLength
    ? value
    : `${value.slice(0, Math.max(0, maximumLength - 1))}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
