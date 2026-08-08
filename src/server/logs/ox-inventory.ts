import type { AutomaticLogWriter } from "./automatic";

type OxInventoryHookName =
  | "buyItem"
  | "craftItem"
  | "swapItems"
  | "usingItem";

type OxInventoryExports = {
  registerHook(
    eventName: OxInventoryHookName,
    callback: ((payload: Record<string, unknown>) => void) | null,
    options?: Record<string, unknown>,
  ): string | number;
};

const POST_HOOK_MINIMUM_VERSION = [2, 47, 0] as const;
const postHookListeners = new Map<string, (...args: unknown[]) => void>();
let lifecycleRegistered = false;
let hooksRegistered = false;

export function startOxInventoryLogging(write: AutomaticLogWriter): void {
  if (!lifecycleRegistered) {
    lifecycleRegistered = true;
    on("onServerResourceStart", (resourceName: string) => {
      if (resourceName !== "ox_inventory") return;
      hooksRegistered = false;
      setImmediate(() => registerOxInventoryHooks(write));
    });
    on("onServerResourceStop", (resourceName: string) => {
      if (resourceName !== "ox_inventory") return;
      hooksRegistered = false;
      clearPostHookListeners();
    });
  }

  if (GetResourceState("ox_inventory") === "started") {
    registerOxInventoryHooks(write);
  } else {
    console.log(
      "[FiveMesh SDK] ox_inventory automatic logging is enabled and will attach when ox_inventory starts.",
    );
  }
}

function registerOxInventoryHooks(write: AutomaticLogWriter): void {
  if (hooksRegistered || GetResourceState("ox_inventory") !== "started") {
    return;
  }

  try {
    const oxInventory = global.exports[
      "ox_inventory"
    ] as unknown as OxInventoryExports;
    const version =
      GetResourceMetadata("ox_inventory", "version", 0) || "unknown";
    const supportsPostHooks = versionAtLeast(
      version,
      POST_HOOK_MINIMUM_VERSION,
    );

    registerHook(oxInventory, "buyItem", supportsPostHooks, (payload) =>
      logPurchase(write, payload),
    );
    registerHook(oxInventory, "craftItem", supportsPostHooks, (payload) =>
      logCraft(write, payload),
    );
    registerHook(oxInventory, "swapItems", supportsPostHooks, (payload) =>
      logTransfer(write, payload),
    );
    registerHook(oxInventory, "usingItem", supportsPostHooks, (payload) =>
      logUse(write, payload),
    );

    hooksRegistered = true;
    console.log(
      `[FiveMesh SDK] ox_inventory logging attached (${version}, ${supportsPostHooks ? "successful actions" : "observed attempts"}).`,
    );
  } catch (error) {
    console.error(
      `[FiveMesh SDK] Failed to attach ox_inventory logging: ${getErrorMessage(error)}`,
    );
  }
}

function registerHook(
  oxInventory: OxInventoryExports,
  eventName: OxInventoryHookName,
  supportsPostHooks: boolean,
  handler: (payload: Record<string, unknown>) => void,
): void {
  if (!supportsPostHooks) {
    oxInventory.registerHook(eventName, handler);
    return;
  }

  const hookId = oxInventory.registerHook(eventName, null);
  const hookEvent = String(hookId);
  const listener = (...args: unknown[]) => {
    const success = args[0] === true;
    const payload = args[1];
    if (!isRecord(payload)) return;
    if (success) handler(payload);
  };
  postHookListeners.set(hookEvent, listener);
  on(hookEvent, listener);
}

function logPurchase(
  write: AutomaticLogWriter,
  payload: Record<string, unknown>,
): void {
  const playerId = playerIdFrom(payload.source) ?? playerIdFrom(payload.toInventory);
  const itemName = displayString(payload.itemName, "item");
  const count = finiteNumber(payload.count);
  write("info", `Player ${playerId ?? "unknown"} purchased ${count ?? 1}x ${itemName}`, {
    eventType: "ox_inventory.item_purchased",
    playerId,
    resource: "ox_inventory",
    data: {
      item_name: itemName,
      count,
      unit_price: finiteNumber(payload.price),
      total_price: finiteNumber(payload.totalPrice),
      currency: optionalString(payload.currency),
      shop_type: optionalString(payload.shopType),
      shop_id: primitiveValue(payload.shopId),
      destination_slot: finiteNumber(payload.toSlot),
      metadata: compactJsonValue(payload.metadata),
    },
  });
}

function logCraft(
  write: AutomaticLogWriter,
  payload: Record<string, unknown>,
): void {
  const playerId = playerIdFrom(payload.source) ?? playerIdFrom(payload.toInventory);
  const recipe = isRecord(payload.recipe) ? payload.recipe : {};
  const itemName = displayString(recipe.name, "item");
  const count = finiteNumber(recipe.count);
  write("info", `Player ${playerId ?? "unknown"} crafted ${count ?? 1}x ${itemName}`, {
    eventType: "ox_inventory.item_crafted",
    playerId,
    resource: "ox_inventory",
    data: {
      item_name: itemName,
      count,
      duration: finiteNumber(recipe.duration),
      ingredients: compactJsonValue(recipe.ingredients),
      bench_id: primitiveValue(payload.benchId),
      bench_index: finiteNumber(payload.benchIndex),
      destination_slot: finiteNumber(payload.toSlot),
    },
  });
}

function logTransfer(
  write: AutomaticLogWriter,
  payload: Record<string, unknown>,
): void {
  const sourcePlayerId = playerIdFrom(payload.source);
  const fromPlayerId = playerIdFrom(payload.fromInventory);
  const toPlayerId = playerIdFrom(payload.toInventory);
  const targetPlayerId = [toPlayerId, fromPlayerId].find(
    (candidate) => candidate && candidate !== sourcePlayerId,
  );
  const fromInventory = inventoryReference(payload.fromInventory);
  const toInventory = inventoryReference(payload.toInventory);

  if (
    payload.action !== "give" &&
    JSON.stringify(fromInventory) === JSON.stringify(toInventory)
  ) {
    return;
  }

  const fromSlot = slotSummary(payload.fromSlot);
  const toSlot = slotSummary(payload.toSlot);
  const itemName =
    optionalString(fromSlot?.name) ??
    optionalString(toSlot?.name) ??
    "item";
  const count = finiteNumber(payload.count) ?? finiteNumber(fromSlot?.count);

  write(
    "info",
    `Player ${sourcePlayerId ?? "unknown"} transferred ${count ?? 1}x ${itemName}`,
    {
      eventType: "ox_inventory.item_transferred",
      playerId: sourcePlayerId,
      targetPlayerId,
      resource: "ox_inventory",
      data: {
        action: optionalString(payload.action),
        item_name: itemName,
        count,
        from_type: optionalString(payload.fromType),
        to_type: optionalString(payload.toType),
        from_inventory: fromInventory,
        to_inventory: toInventory,
        from_slot: fromSlot,
        to_slot: toSlot,
      },
    },
  );
}

function logUse(
  write: AutomaticLogWriter,
  payload: Record<string, unknown>,
): void {
  const playerId =
    playerIdFrom(payload.source) ?? playerIdFrom(payload.inventoryId);
  const item = isRecord(payload.item) ? payload.item : {};
  const itemName = displayString(item.name, "item");

  write("info", `Player ${playerId ?? "unknown"} used ${itemName}`, {
    eventType: "ox_inventory.item_used",
    playerId,
    resource: "ox_inventory",
    data: {
      item_name: itemName,
      item_label: optionalString(item.label),
      slot: finiteNumber(item.slot),
      consume: finiteNumber(payload.consume),
      metadata: compactJsonValue(item.metadata),
    },
  });
}

function playerIdFrom(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return String(value);
  }
  if (isRecord(value)) {
    if (
      value.type === "player" ||
      value.player === true ||
      typeof value.player === "object"
    ) {
      return playerIdFrom(value.id) ?? playerIdFrom(value.owner);
    }
  }
  return undefined;
}

function inventoryReference(value: unknown): unknown {
  if (typeof value === "string" || typeof value === "number") return value;
  if (!isRecord(value)) return null;
  return {
    id: primitiveValue(value.id),
    type: optionalString(value.type),
    owner: primitiveValue(value.owner),
    label: optionalString(value.label),
  };
}

function slotSummary(value: unknown): Record<string, unknown> | null {
  if (typeof value === "number") return { slot: value };
  if (!isRecord(value)) return null;
  return {
    name: optionalString(value.name),
    label: optionalString(value.label),
    count: finiteNumber(value.count),
    slot: finiteNumber(value.slot),
    metadata: compactJsonValue(value.metadata),
  };
}

function compactJsonValue(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length <= 4_096) return JSON.parse(serialized) as unknown;
    return {
      truncated: true,
      preview: serialized.slice(0, 4_096),
    };
  } catch {
    return String(value);
  }
}

function primitiveValue(value: unknown): string | number | boolean | null {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? value
    : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function displayString(value: unknown, fallback: string): string {
  return optionalString(value) ?? fallback;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clearPostHookListeners(): void {
  for (const [eventName, listener] of postHookListeners) {
    removeEventListener(eventName, listener);
  }
  postHookListeners.clear();
}

export function versionAtLeast(
  version: string,
  minimum: readonly [number, number, number],
): boolean {
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  const parsed = match.slice(1, 4).map(Number);
  for (let index = 0; index < minimum.length; index += 1) {
    const current = parsed[index] ?? 0;
    const expected = minimum[index]!;
    if (current > expected) return true;
    if (current < expected) return false;
  }
  return true;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
