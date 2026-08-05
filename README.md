# FiveMesh SDK for FiveM

FiveMesh SDK is a small FiveM resource that bridges your server scripts to the
FiveMesh Management API. API keys stay server-side, while client screenshot
helpers use a tiny RPC bridge when you need to capture and upload a player image.

The SDK targets the first FiveMesh API release:

- CDN object listing
- Single and bulk upload
- Single and bulk delete
- CDN file purge
- Presigned upload URL creation and upload
- Optional screenshot upload through `screenshot-basic`
- Batched Logs ingestion with automatic player identifier enrichment
- Server-only Logs queries with signed-cursor pagination
- Opt-in FiveM, `baseevents`, `ox_inventory`, and txAdmin logging

## Installation

Build the resource, then place this folder in your FiveM `resources` directory.
The examples below assume the resource folder is named `fivemesh-sdk`; if you
keep a different folder name, use that name in `ensure` and `exports[...]`.

```powershell
pnpm install
pnpm build
```

In `server.cfg`:

```cfg
set FIVEMESH_API_KEY "fm_live_..."
# Or use a dedicated Logs-scoped key
# set FIVEMESH_LOGS_API_KEY "fm_live_..."
# Recommended for resources that query Logs
# set FIVEMESH_LOGS_QUERY_API_KEY "fm_live_..."
# Optional, defaults to https://api.fivemesh.io/v1
set FIVEMESH_API_URL "https://api.fivemesh.io/v1"

# Required when using FiveMesh Logs
set FIVEMESH_SERVER_ID "your-cfx-server-id"

# Optional: automatically log useful server, txAdmin, and ox_inventory events
set FIVEMESH_LOGS_AUTOMATIC "true"

ensure screenshot-basic # only required for takeImage/takeServerImage
ensure ox_inventory     # only required for automatic ox_inventory logs
ensure fivemesh-sdk
```

Set FiveMesh ConVars before `ensure fivemesh-sdk` so they are available while
the resource starts.

The API key must have the matching permissions for the exports you call. CDN
uses `read`, `write`, `delete`, and/or `purge`; Logs ingestion uses
`logs:write`, while Logs queries use `logs:read`.

You can also define optional API key profiles for stricter path and permission
separation:

```cfg
set FIVEMESH_API_KEY_PHONE "fm_live_..."
set FIVEMESH_API_KEY_MUGSHOTS "fm_live_..."
```

Profile names are case-sensitive. The SDK resolves `keyProfile = "MUGSHOTS"`
to `FIVEMESH_API_KEY_MUGSHOTS` exactly.

## Server Exports

Lua callers can read the returned value directly. Failed exports return
`success = false` with an `error` payload instead of throwing through the FiveM
runtime bridge. JavaScript callers can use the returned Promise with `await` or
`.then(...)`.

### Upload a file

```lua
local result = exports["fivemesh-sdk"]:uploadFile(fileBytes, {
  filename = "inventory.png",
  path = "images/inventory",
  metadata = {
    source = "inventory"
  }
})

if not result.success then
  print(("FiveMesh upload failed: %s"):format(result.error.message))
  return
end

print(result.object.publicUrl)
```

Data URLs from `canvas.toDataURL()` and raw binary strings from `atob()` are
handled automatically. For a bare base64 string, set `dataEncoding = "base64"`:

```lua
local result = exports["fivemesh-sdk"]:uploadFile(base64Data, {
  filename = "mugshot.png",
  contentType = "image/png",
  dataEncoding = "base64"
})
```

JavaScript:

```js
const result = await exports["fivemesh-sdk"].uploadFile(buffer, {
  filename: "inventory.png",
  path: "images/inventory",
  metadata: { source: "inventory" },
});

console.log(result.object.publicUrl);
```

### Upload an image data URL

```lua
local result = exports["fivemesh-sdk"]:uploadImage(dataUrl, {
  player = "42"
}, {
  keyProfile = "MUGSHOTS",
  filename = "player.webp",
  path = "screenshots"
})

if not result.success then
  print(("FiveMesh image upload failed: %s"):format(result.error.message))
  return
end

print(result.object.publicUrl)
```

### Capture a player screenshot

Requires `screenshot-basic`.

```lua
local result = exports["fivemesh-sdk"]:takeServerImage(source, {
  reason = "support-ticket"
}, {
  path = "screenshots/support",
  filename = "ticket.webp"
}, 15000)

if not result.success then
  print(("FiveMesh screenshot failed: %s"):format(result.error.message))
  return
end

print(result.object.publicUrl)
```

### List objects

```lua
local result = exports["fivemesh-sdk"]:listObjects({
  path = "screenshots",
  limit = 50
})

if not result.success then
  print(("FiveMesh list failed: %s"):format(result.error.message))
  return
end

for _, object in ipairs(result.objects) do
  print(object.key, object.publicUrl)
end
```

### Delete objects

```lua
local deleteResult = exports["fivemesh-sdk"]:deleteObject("screenshots/old.webp")

if not deleteResult.success then
  print(("FiveMesh delete failed: %s"):format(deleteResult.error.message))
end

local result = exports["fivemesh-sdk"]:bulkDelete({
  "screenshots/a.webp",
  "screenshots/b.webp"
})

if not result.success then
  print(("FiveMesh bulk delete failed: %s"):format(result.error.message))
end
```

### Purge CDN files

```lua
local result = exports["fivemesh-sdk"]:purgeObjects({
  "screenshots/a.webp",
  "screenshots/b.webp"
})

if not result.success then
  print(("FiveMesh purge failed: %s"):format(result.error.message))
  return
end

print(result.purged)
```

### Presigned uploads

```lua
local token = exports["fivemesh-sdk"]:createPresignedUrl({
  keyProfile = "PHONE",
  path = "uploads",
  maxFiles = 1,
  expiresIn = 3600,
  allowedMimeTypes = { "image/png", "image/jpeg" }
})

if not token.success then
  print(("FiveMesh upload URL failed: %s"):format(token.error.message))
  return
end

print(token.uploadUrl)
```

## Logs

Logs are queued server-side and sent to `https://logs.fivemesh.io` in batches of
50 events or every five seconds. Client scripts should call a trusted server
event or server export instead of handling the API key themselves. Retryable
requests retain the same batch ID and payload so an accepted batch can be
retried safely without creating another Pipeline write.

### Send a log

When `playerId` or `targetPlayerId` is provided, the SDK automatically reads the
player's FiveM identifiers and adds them to the matching identifier map.

```lua
local result = exports["fivemesh-sdk"]:log("warn", "Player transferred a high-value item", {
  eventType = "inventory.transfer",
  playerId = source,
  targetPlayerId = targetSource,
  data = {
    item = "diamond",
    count = 5
  }
})

if not result.success then
  print(("FiveMesh log failed: %s"):format(result.error.message))
end
```

JavaScript:

```js
const result = await exports["fivemesh-sdk"].info("Player opened a support ticket", {
  eventType: "support.ticket_opened",
  playerId: source,
  data: { ticketId: "ticket_123" },
});
```

Available exports are `log`, `debug`, `info`, `warn`, `error`, `fatal`, and
`flushLogs`. `log` takes `(level, message, options)`; the level helpers take
`(message, options)`.

Supported options:

| Option                    | Description                                                   |
| ------------------------- | ------------------------------------------------------------- |
| `eventType`               | Lowercase searchable event type. Defaults to `log`.           |
| `playerId`                | Transient FiveM server handle; identifiers are added.         |
| `targetPlayerId`          | Target FiveM handle; target identifiers are added.            |
| `data`                    | JSON-serializable structured event data.                      |
| `resource`                | Resource name. Defaults to the resource calling the export.   |
| `traceId`                 | Optional application trace or correlation ID.                 |
| `environment`             | Optional override for the configured environment.             |
| `occurredAt`              | RFC 3339 event time. Defaults to the current time.             |
| `eventId`                 | Stable custom event ID; generated automatically when omitted. |
| `playerIdentifiers`       | Optional identifiers merged over native player identifiers.   |
| `targetPlayerIdentifiers` | Optional identifiers merged over native target identifiers.   |

Native identifier prefixes are removed because the map key already identifies
the provider. For example, `discord:123` becomes `{ discord = "123" }`.
Identifiers include `license`, `license2`, `fivem`, `discord`, `steam`, `xbl`,
`live`, and `ip` when FiveM supplies them.

### Automatic logging

```cfg
set FIVEMESH_LOGS_AUTOMATIC "true"
```

This enables:

- Player connecting, joined, disconnected, died, and killed events
- txAdmin lifecycle, announcement, moderation, whitelist, and admin events
- Successful `ox_inventory` purchases, crafting, transfers, and item use on
  `ox_inventory` 2.47 or newer

Death and kill notifications originate from FiveM's client-reported
`baseevents` resource. The SDK labels them with
`data.event_trust = "client_reported"` and limits them to one event per player
every five seconds. Treat them as useful operational context, not as
authoritative anti-cheat evidence.

For older `ox_inventory` releases, the SDK falls back to logging observed hook
attempts because post-action hooks are unavailable. Same-inventory slot
rearrangements are skipped to avoid noisy, low-value events.

[txAdmin server events](https://github.com/citizenfx/txAdmin/blob/master/docs/events.md)
are delivered while the game server is online and should be treated as
best-effort operational records. Live Console command arguments are redacted
automatically, and txAdmin hardware identifiers are never copied into Logs.
Player identifiers supplied by moderation and whitelist events are stored in
the same protected identifier fields as SDK-enriched player identifiers.

Automatic logging can be tuned independently:

```cfg
# Defaults to the FIVEMESH_LOGS_AUTOMATIC value
set FIVEMESH_LOGS_BASEEVENTS "false"
set FIVEMESH_LOGS_OX_INVENTORY "true"
set FIVEMESH_LOGS_TXADMIN "true"

# Exclude sensitive identifiers when required
set FIVEMESH_LOGS_EXCLUDED_IDENTIFIERS "ip,discord"
```

The SDK detects `ox_inventory` when it starts, so either resource order works.
Keeping `ox_inventory` before `fivemesh-sdk` in `server.cfg` makes startup logs
easier to read.

### Query logs

`queryLogs` is a server export. It calls the FiveMesh API with the SDK's
server-side credential; never proxy the API key or unrestricted query options
through a client event.

```lua
local result = exports["fivemesh-sdk"]:queryLogs({
  lookbackMinutes = 360,
  level = "error",
  playerId = source,
  limit = 100
})

if not result.success then
  print(("FiveMesh query failed: %s"):format(result.error.message))
  return
end

for _, event in ipairs(result.events) do
  print(event.occurred_at, event.event_type, event.message)
end

if result.pagination.hasMore then
  local nextPage = exports["fivemesh-sdk"]:queryLogs({
    from = result.range.from,
    to = result.range.to,
    cursor = result.pagination.nextCursor,
    limit = 100
  })
end
```

The SDK defaults to the configured `FIVEMESH_SERVER_ID`, the latest six hours,
and 100 results. Queries may span at most seven days. Supported filters are
`level`, `eventType`, `resource`, `message`, `playerId`, and an exact
`identifier` object containing `owner`, `key`, and `value`.

## Client Exports

Client exports never use the API key directly. They call back to the server
resource and the server uploads to FiveMesh.

```lua
local result = exports["fivemesh-sdk"]:takeImage({
  reason = "profile"
}, {
  path = "screenshots/profile",
  filename = "profile.webp"
})

if not result.success then
  print(("FiveMesh screenshot failed: %s"):format(result.error.message))
  return
end

print(result.object.publicUrl)
```

## Configuration

| ConVar                            | Default                      | Description                                                              |
| --------------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| `FIVEMESH_API_KEY`                | none                         | Better Auth service API key with `fm_live_` prefix.                      |
| `FIVEMESH_LOGS_API_KEY`           | `FIVEMESH_API_KEY`           | Optional dedicated key with `logs:write`.                               |
| `FIVEMESH_LOGS_QUERY_API_KEY`     | Logs/general API key         | Preferred dedicated key with `logs:read` for `queryLogs`.               |
| `FIVEMESH_API_KEY_<PROFILE_NAME>` | none                         | Optional case-sensitive key profile used by SDK calls with `keyProfile`. |
| `FIVEMESH_API_URL`                | `https://api.fivemesh.io/v1` | API base URL.                                                            |
| `FIVEMESH_SDK_DEBUG`              | `false`                      | Prints the resolved API base URL on boot.                                |
| `FIVEMESH_SERVER_ID`              | none                         | Connected cfx.re server ID used by Logs ingestion.                       |
| `FIVEMESH_LOGS_API_URL`           | `https://logs.fivemesh.io`   | Logs ingestion base URL.                                                 |
| `FIVEMESH_LOGS_ENVIRONMENT`       | `production`                 | Environment attached to SDK-generated logs.                             |
| `FIVEMESH_LOGS_AUTOMATIC`         | `false`                      | Enables automatic core, baseevents, txAdmin, and ox_inventory logs.     |
| `ENABLE_AUTOMATIC_LOGGING`        | `false`                      | Compatibility alias for `FIVEMESH_LOGS_AUTOMATIC`.                       |
| `FIVEMESH_LOGS_BASEEVENTS`        | automatic setting            | Overrides automatic death and kill logging.                             |
| `FIVEMESH_LOGS_OX_INVENTORY`      | automatic setting            | Overrides automatic ox_inventory logging.                               |
| `FIVEMESH_LOGS_TXADMIN`           | automatic setting            | Overrides automatic txAdmin event logging.                              |
| `FIVEMESH_LOGS_BATCH_SIZE`        | `50`                         | Events sent per batch, from 1 to 50.                                     |
| `FIVEMESH_LOGS_FLUSH_INTERVAL`    | `5000`                       | Flush interval in milliseconds, from 1000 to 60000.                      |
| `FIVEMESH_LOGS_EXCLUDED_IDENTIFIERS` | none                      | Comma-separated native identifier keys to omit.                          |

`FIVEMESH_CDN_API_KEY` and `FIVEMESH_SERVICE_API_KEY` are accepted as fallback
key names for early adopters, but `FIVEMESH_API_KEY` is preferred.

## License

MIT License

Copyright (c) 2026 FiveMesh
