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

### Upload a file

```lua
local result = exports["fivemesh-sdk"]:uploadFile(fileBytes, {
  filename = "inventory.png",
  path = "images/inventory",
  metadata = {
    source = "inventory"
  }
})

print(result.object.publicUrl)
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

print(result.object.publicUrl)
```

### List objects

```lua
local result = exports["fivemesh-sdk"]:listObjects({
  path = "screenshots",
  limit = 50
})

for _, object in ipairs(result.objects) do
  print(object.key, object.publicUrl)
end
```

### Delete objects

```lua
exports["fivemesh-sdk"]:deleteObject("screenshots/old.webp")

local result = exports["fivemesh-sdk"]:bulkDelete({
  "screenshots/a.webp",
  "screenshots/b.webp"
})
```

### Purge CDN files

```lua
local result = exports["fivemesh-sdk"]:purgeObjects({
  "screenshots/a.webp",
  "screenshots/b.webp"
})

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
