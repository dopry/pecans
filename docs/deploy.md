# Deployment

Pecans is a stateless service: releases live on GitHub, and pecans holds only
an in-memory cache. Any Node.js ≥ 22.12 host, container platform, or PaaS
works.

## Configuration

```sh
# port for the service (default 5000)
export PORT=6000

# the GitHub repository holding your releases
export GITHUB_OWNER=me
export GITHUB_REPO=myapp

# access token with read access to the repository
# (optional for public repositories)
export GITHUB_TOKEN=...

# enables POST /webhook/refresh (GitHub-signed cache busting); the endpoint
# is disabled when unset. Generate with: openssl rand -hex 32
export PECANS_REFRESH_SECRET=...

# express "trust proxy" setting, required behind a TLS-terminating reverse
# proxy so generated urls come out https://
# accepts true, a hop count, "loopback", a CIDR list, or a JSON array
# http://expressjs.com/en/guide/behind-proxies.html
export TRUST_PROXY=loopback

# path prefix when a proxy rewrites the path without telling express
export PECANS_BASE_PATH=

# release cache lifetime in seconds (default 7200)
export PECANS_CACHE_MAX_AGE=7200
```

Then:

```sh
$ npm ci && npm run build
$ npm start
```

## Docker

The repository ships a multi-stage `Dockerfile` (non-root, healthcheck on
`/api/status`):

```sh
$ docker build -t pecans .
$ docker run -p 5000:5000 \
    -e GITHUB_OWNER=me -e GITHUB_REPO=myapp -e GITHUB_TOKEN=... \
    -e TRUST_PROXY=true pecans
```

## Heroku

`app.json` declares the required environment; the deploy button prompts for
`GITHUB_OWNER`, `GITHUB_REPO`, and `GITHUB_TOKEN`.

Migrating a 1.x deployment? Environment variable names changed — see the
[migration guide](migrating-2.0.md).
