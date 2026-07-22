# Migrating from 1.x to 2.x

Pecans 2.0 modernizes the runtime, hardens the HTTP surface, and adopts
[update.electronjs.org](https://github.com/electron/update.electronjs.org)
semantics for auto-update routes. This guide lists every breaking change with
its replacement. 2.x ships with **no deprecated APIs**: everything removed is
listed here, and nothing else is scheduled for removal.

## Runtime

- **ESM only.** `require('@dopry/pecans')` no longer works; use
  `import { Pecans } from "@dopry/pecans"`.
- **Node.js ≥ 22.12** is required.
- The express router is built on **Express 5**. Host apps composing
  `pecans.router` should be on Express 5 as well.

## Server operators

### Environment variables

| 1.x | 2.x |
| --- | --- |
| `GITHUB_REPO=owner/repo` (combined) | `GITHUB_OWNER=owner` and `GITHUB_REPO=repo` (separate) |
| `GITHUB_USERNAME` / `GITHUB_PASSWORD` | removed — use `GITHUB_TOKEN` |
| `GITHUB_SECRET` (webhook secret, default `secret`) | `PECANS_REFRESH_SECRET` (no default; webhook disabled when unset) |
| `API_USERNAME` / `API_PASSWORD` (basic auth on the debug API) | removed — the API is public; wrap `pecans.router` with your own middleware if you need auth |
| `TRUST_PROXY` | unchanged (`true`, hop count, `loopback`, CIDR list, or JSON array) |
| `PORT` | unchanged |
| — | `PECANS_BASE_PATH` (path prefix behind rewriting proxies) |
| — | `PECANS_CACHE_MAX_AGE` (release cache seconds, default 7200) |

### Webhook

The GitHub release webhook moved from `/refresh` to **`/webhook/refresh`**
and is enabled by setting `PECANS_REFRESH_SECRET`. Payload signatures are
verified with [@octokit/webhooks](https://github.com/octokit/webhooks.js).
For non-GitHub backends the secret is accepted **only** in the
`X-Pecans-Secret` header — the 1.x `?secret=` query parameter was removed
(query strings leak secrets into proxy and access logs). Use a high-entropy
secret, e.g. `openssl rand -hex 32`.

## HTTP surface

### Removed routes

| Removed | Replacement |
| --- | --- |
| `GET /` (user-agent-detected download) | none — platform selection is the client's responsibility |
| `GET /update?platform=&version=` (redirect) | `/update/:platform/:version` |
| Atom/RSS feeds (`/feed/channel/*.atom`) | none — poll `/api/versions` |
| `/api/resolve` | `/api/versions?platform=&channel=` |
| `/api/version/:version` | `/api/versions?version=<range>` |

### Behavior changes

- **Platform is required** on `/download`, `/download/version/:tag`, and
  `/download/channel/:channel`. User-agent autodetection was removed; a
  missing platform returns 400.
- **Explicit channels are strict.** `/download/channel/stable/...` (or
  `?channel=stable`) returns 404 when the named channel has no matching
  release, instead of silently serving another channel's build. Only the
  bare `/download/:platform` route keeps the any-channel fallback.
- **`?filetype` was removed from `/update`.** The query is ignored; feeds
  always serve the squirrel zip contract. Select the MSIX feed with the
  format segment: `/update/:platform/msix/:version`. (`?filetype` remains on
  `/download`, where the feed-minted urls use it.)
- **`/api/versions` asset objects no longer include `raw`** (the backend's
  private payload, e.g. the GitHub API asset object). Use `/download` or
  `/dl` routes instead of `raw.browser_download_url`.
- **`/api/channels` is slim**: `{name, latest, versions_count, published_at}`
  only — the embedded `releases`/`latest_release` objects are gone. Fetch
  `/api/versions?channel=<name>` for a channel's releases (notes included).
- **Filename architecture detection is token-based.** Version digits
  (`MyApp-1.32.0`), `x86_64`, and electron-packager's `win32-x64` ids now
  classify as 64-bit (1.x read them as 32-bit), and letters inside words
  (`Charmap`) no longer classify as arm builds. Feeds over existing releases
  may resolve different assets after upgrade.
- **arm64 is first-class.** `windows_arm64`, `linux_arm64` (and deb/rpm/msix
  variants) now ingest instead of being dropped. Bare-os requests
  (`/download/windows`) never default to an arm64 build.

### New routes worth adopting

- `/dl/:os/:arch` — discrete resolution (`?channel`, `?version`,
  `?pkg=deb|rpm|msix`).
- `/update/:platform/{squirrel|msix}/:version` (+ `/RELEASES`, + channel
  variants) — update.electronjs.org-compatible format segment; see
  [URL Routing](urls.md).
- update.electronjs.org-style platform ids (`darwin-arm64`, `win32-x64`,
  `win32-arm64`, `linux-x64`, ...) are accepted on the `/download` and
  `/update` routes. The `/api/versions?platform=` filter takes canonical
  composite ids (`osx_64`, `windows_arm64`, ...) only.

## Update clients (shipped apps)

- **Squirrel.Mac and Squirrel.Windows feeds are unchanged.** Deployed apps
  using `/update/:platform/:version` (and the channel variants) keep
  updating without any coordination.
- **MSIX clients must use the format segment**:
  `/update/win32-x64/msix/:version` (or the channel variant). A feed URL
  configured with the 2.0-prerelease-era `?filetype=msix` query receives the
  squirrel feed instead — migrate before shipping MSIX builds.

## Module consumers

| Removed | Replacement |
| --- | --- |
| `GitHubBackend` | `PecansGitHubBackend` — note the argument order is `owner, repo, token` (was `token, owner, repo`) |
| `PecansSettings.timeout` | none needed (accepted but unused since the fork) |
| `PecansReleaseDTO.channel` | none — the channel always derives from the version's prerelease identifier; `PecansRelease.channel` (derived) is unchanged |
| `Pecans.versions`, `Versions`, `resolveReleaseAssetForVersion` | `ReleaseService` / `resolveAssetForRelease` |
| `getPlatformFromUserAgent`, `getArchFromUserAgent`, `getOsFromUserAgent` | none — detect client-side |
| `Pecans.getChannelFromQuery` | none (unused) |
| `pecans.before("download", fn)` / `pecans.after("download", fn)` interceptors | `beforeDownload` / `afterDownload` **events** with payload `{req, release, asset}` — notifications only (return values ignored); for auth or gating, wrap `pecans.router` with express middleware |

See [Node.js module usage](module.md) for current examples.
