# GitHub Integration

Pecans fetches releases from GitHub Releases and caches the list (2 hours by
default, configurable with `PECANS_CACHE_MAX_AGE`). Without a webhook there
can be a delay between publishing a release and pecans serving it.

## Release webhook

Add a [GitHub webhook](https://docs.github.com/en/webhooks) on your releases
repository:

- **Payload URL**: `https://download.myapp.com/webhook/refresh`
- **Content type**: `application/json`
- **Secret**: the value of your `PECANS_REFRESH_SECRET` environment variable
- **Events**: Releases

Payload signatures are verified with
[@octokit/webhooks](https://github.com/octokit/webhooks.js); the endpoint is
disabled entirely when `PECANS_REFRESH_SECRET` is unset. Use a high-entropy
secret, e.g. `openssl rand -hex 32`.

The 1.x endpoint (`/refresh` with `GITHUB_SECRET`, default `secret`) was
replaced in 2.0 — see the [migration guide](migrating-2.0.md).
