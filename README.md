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
ensure screenshot-basic # only required for takeImage/takeServerImage
ensure fivemesh-sdk

set FIVEMESH_API_KEY "fm_live_..."
# Optional, defaults to https://api.fivemesh.io/v1
set FIVEMESH_API_URL "https://api.fivemesh.io/v1"
```

The API key must have the matching CDN permissions for the exports you call:
`read`, `write`, `delete`, and/or `purge`.

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
| `FIVEMESH_API_KEY_<PROFILE_NAME>` | none                         | Optional case-sensitive key profile used by SDK calls with `keyProfile`. |
| `FIVEMESH_API_URL`                | `https://api.fivemesh.io/v1` | API base URL.                                                            |
| `FIVEMESH_SDK_DEBUG`              | `false`                      | Prints the resolved API base URL on boot.                                |

`FIVEMESH_CDN_API_KEY` and `FIVEMESH_SERVICE_API_KEY` are accepted as fallback
key names for early adopters, but `FIVEMESH_API_KEY` is preferred.

## License

MIT License

Copyright (c) 2026 FiveMesh
