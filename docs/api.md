# API

Pecans exposes a small read-only JSON API. It is public: if you need to
restrict it, wrap `pecans.router` with your own middleware (see
[module usage](module.md)). The 1.x `API_USERNAME`/`API_PASSWORD` basic auth,
`/api/resolve`, and `/api/version/:version` endpoints were removed in 2.0 —
see the [migration guide](migrating-2.0.md).

## List releases

```
GET https://download.myapp.com/api/versions
```

Supports `?channel=<name|*>`, `?platform=<platform id>`, and
`?version=<semver range|latest>`. Releases are sorted newest first and
include `version`, `channel`, `notes`, `published_at`, and `assets`. Asset
objects carry `{id, filename, type, os, arch, pkg, size, content_type}` —
the backend's private payload (`raw`) is never serialized.

```
GET https://download.myapp.com/api/versions?channel=beta&version=%3E%3D2.0.0
```

On a named prerelease channel a `?version` range matches that channel's
releases across every major.minor.patch, so the request above lists
`2.1.0-beta.1` alongside `2.5.0-beta.2`. Semver precedence still applies:
`2.0.0-beta.3` sorts below `2.0.0`, so use a `-0` lower bound
(`version=%3E%3D2.0.0-0`) to include the `2.0.0` betas themselves. With
`*` or no channel, ranges follow standard semver semantics: a prerelease
only matches inside the major.minor.patch of a prerelease comparator
(`>=2.0.0` lists stable releases only; `>=2.1.0-beta.0` also lists the
`2.1.0` betas).

## List channels

```
GET https://download.myapp.com/api/channels
```

Returns slim summaries: `{name, latest, versions_count, published_at}`.
`latest` is the channel's highest version and `published_at` is that
release's publish date, so a backport published after a newer release does
not become the channel's latest. Fetch a channel's releases (notes
included) with `/api/versions?channel=<name>`.

## Server status

```
GET https://download.myapp.com/api/status
```

Returns `{uptime}` in seconds.

## Release notes

```
GET https://download.myapp.com/notes/2.1.0
```

Also accepts `?version=<range|latest>` and `?channel=<name|*>`. Responds
with JSON (`{note}`) or plain text depending on the `Accept` header.

Without a channel the notes come from the latest `stable` release, falling
back to any channel when stable has none — the same rule as a bare
`/download/:platform` link. A named channel is honored strictly: no release
on it is a 404, never a prerelease served to stable users. Asking for a
specific version serves that release's notes whatever channel it is on.
