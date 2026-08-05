import assert from "node:assert/strict";
import test from "node:test";

import { createAutomaticEventThrottle } from "../src/server/logs/automatic.ts";
import {
  assertRequiredConfig,
  getLogsQueryBearerToken,
} from "../src/server/config.ts";
import { buildLogEvent } from "../src/server/logs/event.ts";
import { formatPlayerIdentifiers } from "../src/server/logs/identifier-format.ts";
import { versionAtLeast } from "../src/server/logs/ox-inventory.ts";
import {
  LogsTransport,
  LogsTransportError,
} from "../src/server/logs/transport.ts";
import { buildLogsQueryRequest } from "../src/server/logs/query.ts";

test("formats native identifiers and preserves values after the first colon", () => {
  assert.deepEqual(
    formatPlayerIdentifiers(
      [
        "license:abcdef",
        "discord:123456789",
        "ip:2001:db8::1",
        "invalid",
      ],
      new Set(["discord"]),
    ),
    {
      license: "abcdef",
      ip: "2001:db8::1",
    },
  );
});

test("builds an SDK event with native and explicit identifier enrichment", () => {
  const event = buildLogEvent(
    "warn",
    "Player transferred an item",
    {
      eventType: "inventory.transfer",
      playerId: 42,
      targetPlayerId: "84",
      playerIdentifiers: { discord: "override" },
      data: { item: "diamond", count: 5 },
    },
    {
      eventId: "event_inventory_transfer_0001",
      environment: "production",
      getIdentifiers: (playerId) => ({
        license: `license-${playerId}`,
        discord: `discord-${playerId}`,
      }),
      now: new Date("2026-08-04T13:00:00.000Z"),
      resource: "ox_inventory",
    },
  );

  assert.equal(event.player_id, "42");
  assert.equal(event.target_player_id, "84");
  assert.deepEqual(event.player_identifiers, {
    license: "license-42",
    discord: "override",
  });
  assert.deepEqual(event.target_player_identifiers, {
    license: "license-84",
    discord: "discord-84",
  });
  assert.equal(event.occurred_at, "2026-08-04T13:00:00.000Z");
  assert.equal(event.resource, "ox_inventory");
});

test("rejects invalid events before they can poison an atomic batch", () => {
  assert.throws(
    () =>
      buildLogEvent(
        "info",
        " ",
        {},
        {
          eventId: "event_invalid_0001",
          environment: "production",
          getIdentifiers: () => ({}),
          now: new Date(),
          resource: "test",
        },
      ),
    /non-empty/,
  );
});

test("detects ox_inventory post-hook support", () => {
  assert.equal(versionAtLeast("2.47.0", [2, 47, 0]), true);
  assert.equal(versionAtLeast("v2.47.1", [2, 47, 0]), true);
  assert.equal(versionAtLeast("2.46.1", [2, 47, 0]), false);
  assert.equal(versionAtLeast("unknown", [2, 47, 0]), false);
});

test("throttles client-reported baseevents per player", () => {
  const throttle = createAutomaticEventThrottle(5_000);

  assert.equal(throttle.accept("42", 10_000), true);
  assert.equal(throttle.accept("42", 14_999), false);
  assert.equal(throttle.accept("84", 14_999), true);
  assert.equal(throttle.accept("42", 15_000), true);
  throttle.clear("42");
  assert.equal(throttle.accept("42", 15_001), true);
});

test("reuses the same batch id and events after a retryable failure", async () => {
  const attempts: Array<{ batchId: string; eventIds: string[] }> = [];
  const transport = new LogsTransport({
    batchSize: 50,
    flushIntervalMs: 60_000,
    sendBatch: async (batch) => {
      attempts.push({
        batchId: batch.batchId,
        eventIds: batch.events.map((event) => event.event_id),
      });
      if (attempts.length === 1) {
        throw new LogsTransportError({
          code: "LOGS_NETWORK_ERROR",
          message: "Connection closed before the response arrived.",
          retryable: true,
        });
      }
      return batch.events.length;
    },
  });

  transport.enqueue({
    event_id: "event_retry_0001",
    event_type: "log",
    level: "info",
    message: "Retry me once",
    occurred_at: "2026-08-04T13:00:00.000Z",
  });

  await assert.rejects(() => transport.flush(), /Connection closed/);
  assert.equal(transport.pendingEvents, 1);

  const result = await transport.flush();
  assert.equal(result.acceptedEvents, 1);
  assert.equal(result.pendingEvents, 0);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0]?.batchId, attempts[1]?.batchId);
  assert.deepEqual(attempts[0]?.eventIds, attempts[1]?.eventIds);

  await transport.close();
});

test("reconciles an in-progress batch without surfacing a failure", async () => {
  const attempts: string[] = [];
  const transport = new LogsTransport({
    batchSize: 50,
    flushIntervalMs: 60_000,
    sendBatch: async (batch) => {
      attempts.push(batch.batchId);
      if (attempts.length === 1) {
        throw new LogsTransportError({
          code: "batch_in_progress",
          message: "This batch is still being accepted.",
          retryAfterMs: 1,
          retryable: true,
          status: 503,
        });
      }
      return batch.events.length;
    },
  });

  transport.enqueue({
    event_id: "event_processing_0001",
    event_type: "log",
    level: "info",
    message: "Wait for acknowledgement",
    occurred_at: "2026-08-04T13:00:00.000Z",
  });

  const result = await transport.flush();
  assert.equal(result.acceptedEvents, 1);
  assert.equal(result.pendingEvents, 0);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0], attempts[1]);

  await transport.close();
});

test("reconciles an acknowledgement timeout without surfacing or duplicating it", async () => {
  const attempts: string[] = [];
  const transport = new LogsTransport({
    batchSize: 50,
    flushIntervalMs: 60_000,
    sendBatch: async (batch) => {
      attempts.push(batch.batchId);
      if (attempts.length === 1) {
        throw new LogsTransportError({
          code: "LOGS_REQUEST_TIMEOUT",
          message: "Acknowledgement timed out.",
          retryAfterMs: 1,
          retryable: true,
        });
      }
      return batch.events.length;
    },
  });

  transport.enqueue({
    event_id: "event_timeout_0001",
    event_type: "log",
    level: "info",
    message: "Reconcile the same event",
    occurred_at: "2026-08-04T13:00:00.000Z",
  });

  const result = await transport.flush();
  assert.equal(result.acceptedEvents, 1);
  assert.equal(result.pendingEvents, 0);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0], attempts[1]);

  await transport.close();
});

test("builds a tenant-safe Logs query with a six-hour default range", () => {
  const request = buildLogsQueryRequest(
    {
      level: "error",
      message: "connection",
      playerId: 42,
      limit: 50,
    },
    {
      now: new Date("2026-08-05T12:00:00.000Z"),
      serverId: "57GK77",
    },
  );

  assert.deepEqual(request, {
    serverId: "57gk77",
    from: "2026-08-05T06:00:00.000Z",
    to: "2026-08-05T12:00:00.000Z",
    level: "error",
    message: "connection",
    playerId: "42",
    limit: 50,
  });
  assert.equal("workspaceId" in request, false);
});

test("omits null optional fields introduced by the FiveM bridge", () => {
  const request = buildLogsQueryRequest(
    {
      level: null,
      identifier: null,
    } as unknown as Parameters<typeof buildLogsQueryRequest>[0],
    {
      now: new Date("2026-08-05T12:00:00.000Z"),
      serverId: "57gk77",
    },
  );

  assert.equal("level" in request, false);
  assert.equal("identifier" in request, false);
});

test("rejects ambiguous or over-wide SDK Logs query ranges", () => {
  const context = {
    now: new Date("2026-08-05T12:00:00.000Z"),
    serverId: "57gk77",
  };

  assert.throws(
    () =>
      buildLogsQueryRequest(
        {
          from: "2026-08-05T06:00:00.000Z",
          lookbackMinutes: 60,
        },
        context,
      ),
    /either from or lookbackMinutes/,
  );
  assert.throws(
    () => buildLogsQueryRequest({ lookbackMinutes: 10_081 }, context),
    /between 1 and 10080/,
  );
});

test("supports a dedicated read-only Logs query key", () => {
  const previousGetConvar = globalThis.GetConvar;
  const convars: Record<string, string> = {
    FIVEMESH_LOGS_QUERY_API_KEY: "fm_live_logs_read",
  };
  globalThis.GetConvar = (name, fallback = "") => convars[name] ?? fallback;

  try {
    assert.doesNotThrow(() => assertRequiredConfig());
    assert.equal(
      getLogsQueryBearerToken(),
      "Bearer fm_live_logs_read",
    );
  } finally {
    globalThis.GetConvar = previousGetConvar;
  }
});

test("rejects query-only credentials when automatic ingestion is enabled", () => {
  const previousGetConvar = globalThis.GetConvar;
  const convars: Record<string, string> = {
    FIVEMESH_LOGS_QUERY_API_KEY: "fm_live_logs_read",
    FIVEMESH_LOGS_AUTOMATIC: "true",
  };
  globalThis.GetConvar = (name, fallback = "") => convars[name] ?? fallback;

  try {
    assert.throws(
      () => assertRequiredConfig(),
      /Automatic FiveMesh Logs ingestion requires .*logs:write/,
    );
  } finally {
    globalThis.GetConvar = previousGetConvar;
  }
});

test("scheduled flushing retries a retained batch without new events", async () => {
  let attempts = 0;
  const transport = new LogsTransport({
    batchSize: 1,
    flushIntervalMs: 5,
    sendBatch: async (batch) => {
      attempts += 1;
      if (attempts === 1) {
        throw new LogsTransportError({
          code: "LOGS_NETWORK_ERROR",
          message: "Connection closed before acknowledgement.",
          retryable: true,
        });
      }
      return batch.events.length;
    },
  });
  const originalConsoleError = console.error;
  console.error = () => undefined;

  try {
    transport.enqueue({
      event_id: "event_scheduled_retry_0001",
      event_type: "log",
      level: "info",
      message: "Retry without another event",
      occurred_at: "2026-08-04T13:00:00.000Z",
    });

    await waitFor(() => transport.pendingEvents === 0);
    assert.equal(attempts, 2);
  } finally {
    console.error = originalConsoleError;
    await transport.close();
  }
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for Logs transport.");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
