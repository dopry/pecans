# Pecans

Pecans is an Electron Release Server.

## Features

- Download URLs
  - `/` — detect platform from the browser user agent and serve the latest build
  - `/download/:platform` — latest build for a platform (`osx_64`, `windows_64`, … legacy aliases like `darwin`, `win32`, `mac-arm64` are accepted)
  - `/download/channel/:channel/:platform?` — latest build on a release channel (platform falls back to user-agent detection when omitted)
  - `/download/version/:tag/:platform?` — a specific version (platform falls back to user-agent detection when omitted)
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

## Documentation

[Check out the documentation](https://pecans.darrelopry.com/v/main/docs) for more details.

## Acknowledgements

- forked from [Nuts](https://github.com/GitbookIO/nuts).
