# URL Routing

All routes are GET except the cache-bust webhook (`POST /webhook/refresh`).
Examples assume the server at `https://download.myapp.com`.

## Request vocabulary

Four request concepts appear across the surface; they sit on different axes:

| Concept | Where | Values | Meaning |
| --- | --- | --- | --- |
| **platform id** | `/download/:platform`, `/update/:platform/...` | composite ids (`osx_64`, `windows_arm64`, `linux_deb_64`, ...) and aliases (`darwin-arm64`, `win32-x64`, `linux-x64`, ...) | os + optional package + optional arch in one segment |
| **os / arch** | `/dl/:os/:arch` | os: `osx`, `windows`, `linux`; arch: `32`, `64`, `arm64` (all OSes), `universal` (`osx`/`windows` only) | discrete resolution, one axis per segment |
| **pkg** | `/dl` `?pkg=` | `deb`, `rpm`, `msix` | package family of an asset; absent = the platform default — `/dl` then serves `.dmg` (osx), `.exe` (windows), `.tgz`/`.tar.gz` (linux) |
| **format** | `/update/:platform/:format/:version` | `squirrel`, `msix` | update _protocol_ the client speaks |
| **filetype** | `/download` `?filetype=` | supported extension (`zip`, `dmg`, `exe`, ...) | extension preference when picking one asset; feed-minted urls use it |

Platform aliases cover the `${process.platform}-${process.arch}` matrix a
modern Electron app can produce: `darwin-x64`, `darwin-arm64`,
`darwin-universal`, `win32-x64`, `win32-ia32`, `win32-arm64`, `linux-x64`,
`linux-arm64`, plus legacy names (`darwin`, `mac`, `win32`, `osx-x64`, ...).
(`linux-ia32` is not aliased — Electron dropped 32-bit Linux in v4; use the
canonical `linux_32` id if you need it.)

## Downloads

- `/download/:platform` — latest stable build for the platform. Bare-os ids
  (`/download/windows`) resolve the default population (x64, or universal on
  mac); arm64 ranks last and is only served when it is the sole matching
  build. If the stable channel is empty the bare route falls back to any
  channel; an explicit channel never does.
- `/download/channel/:channel/:platform` — latest build on a channel (404
  when the channel has no matching release).
- `/download/version/:tag/:platform` — a specific version (`:tag` is a
  semver version, a range, or `latest`). An exact version is served
  whatever channel it is on; a range resolves within the requested channel.
- `/download/:tag/:filename` — a release asset by exact filename.
- `?filetype=zip` — prefer an extension (other extensions remain fallbacks).
- `/dl/:os/:arch` — discrete resolution; supports `?channel`, `?version`,
  and `?pkg=deb|rpm|msix`. Examples: `/dl/linux/arm64?pkg=deb`,
  `/dl/windows/universal?pkg=msix` (the `.msixbundle`).
- `/dl/:filename` — a release asset by exact filename.

## Auto-update feeds

Squirrel.Mac-shaped JSON (`204` when current; `200 {url, name, notes,
pub_date}` when an update exists). On the channel variants an unknown
channel is a `404`, so a typo in the feed url cannot pass for "up to date":

- `/update/:platform/:version`
- `/update/channel/:channel/:platform/:version`

Squirrel.Windows manifest (filenames rewritten to `/dl/` urls):

- `/update/:platform/:version/RELEASES`
- `/update/channel/:channel/:platform/:version/RELEASES`

update.electronjs.org-compatible format segment (`squirrel` | `msix`,
case-insensitive; unknown formats 404). The channel variants are a pecans
extension — uejs has no channel concept:

- `/update/:platform/squirrel/:version` (+ `/RELEASES`)
- `/update/:platform/msix/:version` — the MSIX feed (Electron
  39.5+/40.2+/41+); MSIX has no `RELEASES` manifest
- `/update/channel/:channel/:platform/:format/:version` (+ `/RELEASES`)

`:version` is the client's installed version and must be a specific semver
version, not a range. The bare routes serve the stable channel: a client on
`2.8.0-beta.2` is offered `2.8.0` or newer stable releases. The channel
variants serve every newer release on that channel, including across minor
and major bumps (`2.8.0-beta.2` is offered `2.9.0-beta.1`), and a stable
client polling a channel variant is offered that channel's newest build.

## API

- `/api/channels` — channel summaries `{name, latest, versions_count, published_at}`
- `/api/versions` — releases (notes included), filterable with `?channel`,
  `?platform`, `?version` (range or `latest`)
- `/api/status` — server uptime
- `/notes/:version` (or `/notes?version=`) — release notes, JSON or plain
  text via `Accept`; `?channel=<name|*>` selects a channel, defaulting to
  `stable`

## Webhook

- `POST /webhook/refresh` — cache bust; see [Deploy Pecans](deploy.md) for
  authentication.
