# GitHub Integration

Pecans fetches releases from GitHub Releases and caches the list (2 hours by
default, configurable with `PECANS_CACHE_MAX_AGE`). Without a webhook there
can be a delay between publishing a release and pecans serving it.

## Channels come from the tag

Pecans derives a release's channel from its tag's prerelease identifier,
not from GitHub's "Set as a pre-release" checkbox: `2.9.0` is `stable`,
`2.9.0-beta.1` is `beta`. Ticking the box on a release tagged `2.9.0` does
not keep it away from stable users — retag it `2.9.0-beta.1` for that.
Pecans logs a warning when a release's flag and tag disagree. See
[the FAQ](faq.md) for the accepted tag shapes.

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
