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

## List channels

```
GET https://download.myapp.com/api/channels
```

Returns slim summaries: `{name, latest, versions_count, published_at}`.
Fetch a channel's releases (notes included) with
`/api/versions?channel=<name>`.

## Server status

```
GET https://download.myapp.com/api/status
```

Returns `{uptime}` in seconds.

## Release notes

```
GET https://download.myapp.com/notes/2.1.0
```

Also accepts `?version=<range|latest>`. Responds with JSON (`{note}`) or
plain text depending on the `Accept` header.
