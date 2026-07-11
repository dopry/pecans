# Pecans

Pecans is an Electron Release Server.

## Features

- Download URLs (the client chooses the platform; user-agent autodetection was removed in 2.0)
  - `/download/:platform` — latest build for a platform (`osx_64`, `windows_64`, … legacy aliases like `darwin`, `win32`, `mac-arm64` are accepted)
  - `/download/channel/:channel/:platform` — latest build on a release channel
  - `/download/version/:tag/:platform` — a specific version
  - `/download/:tag/:filename` — a specific release asset by filename
  - `/dl/:os/:arch` — resolve by discrete OS (`osx`, `windows`, `linux`) and arch (`32`, `64`, `arm64`, `universal`); supports `?channel`, `?version`, and `?pkg` (`deb`/`rpm`) queries
  - `/dl/:filename` — a release asset by filename
- Auto-updates with [Squirrel](https://github.com/Squirrel)
  - For Mac using Squirrel.Mac
    - `/update/:platform/:version`
    - `/update/channel/:channel/:platform/:version`
    - `/update?version=<x.x.x>&platform=osx` (deprecated; redirects to `/update/:platform/:version`)
  - For Windows using Squirrel.Windows and NuGet packages
    - `/update/:platform/:version/RELEASES`
    - `/update/channel/:channel/:platform/:version/RELEASES`
- API
  - `/api/channels` — release channels with their latest versions
  - `/api/versions` — releases, filterable with `?channel`, `?platform`, `?version`
  - `/api/status` — server uptime
- Release Notes API, `/notes?version=<x.x.x>` (JSON or plain text via `Accept`)
- GitHub Release Integration
- GitHub Private Repository Hosted Releases
- GitHub Release Webhook to keep releases up-to-date
- Release Channels (`beta`, `alpha`, ...)
- Express App (composable)

## Deploy it / Start it

[Follow our guide to deploy Pecans](https://pecans.darrelopry.com/v/main/docs/deploy).

## Auto-updater / Squirrel

This server provides an endpoint for [Squirrel auto-updater](https://github.com/atom/electron/blob/master/docs/api/auto-updater.md), it supports both [OS X](https://pecans.darrelopry.com/v/main/docs/update-osx) and [Windows](https://pecans.darrelopry.com/v/main/docs/update-windows).

## Cache-refresh webhook

Release lists are cached (2 hours by default). `POST /webhook/refresh` busts
the cache without waiting for expiry; it is enabled by configuring a
`refreshSecret` on the backend and disabled otherwise.

- **GitHub backend**: point a GitHub _release_ webhook at
  `/webhook/refresh` with the secret set to your `refreshSecret`; the
  payload signature is verified with
  [@octokit/webhooks](https://github.com/octokit/webhooks.js).
- **Other backends** (base `Backend` middleware): send the `refreshSecret`
  in an `X-Pecans-Secret` header or a `?secret=` query parameter. A valid
  request responds `200 {"refreshed": true}`; a missing or wrong secret
  responds `403`.

## Documentation

[Check out the documentation](https://pecans.darrelopry.com/v/main/docs) for more details.

## Acknowledgements

- forked from [Nuts](https://github.com/GitbookIO/nuts).
