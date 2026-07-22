# Use Pecans as a Node.js module

Pecans is an ESM-only package (Node.js ≥ 22.12) exposing an Express 5 router
you can compose into your own app — for custom auth, analytics, or mounting
under a path.

## Installation

```
$ npm install @dopry/pecans
```

## Usage

```js
import express from "express";
import { Pecans, PecansGitHubBackend } from "@dopry/pecans";

const backend = new PecansGitHubBackend(
  "me", // owner
  "myrepo", // repo
  process.env.GITHUB_TOKEN, // optional for public repos
  { refreshSecret: process.env.PECANS_REFRESH_SECRET },
);

const pecans = new Pecans(backend, { basePath: "/myapp" });

const app = express();
app.use("/myapp", pecans.router);
app.listen(4000);
```

## Options

`new Pecans(backend, options)`:

- `basePath` (string): path segment your reverse proxy strips before the app
  sees the request; embedded into generated urls (default `""`)
- `preferUniversal` (boolean): prefer a mac universal build over
  arch-specific builds when both exist (default `true`)
- `includeVersionInReleaseNotes` (boolean): prefix each version's notes with
  the version in aggregated update feeds (default `false`)

`new PecansGitHubBackend(owner, repo, token?, options)`:

- `refreshSecret` (string): enables `POST /webhook/refresh` with GitHub
  signature verification
- `cacheMaxAge` (number): release cache lifetime in seconds (default 7200)
  — the cache lives on the backend, so this is a backend option, not a
  `Pecans` option
- `baseUrl` (string): GitHub API base url (GitHub Enterprise)
- `proxyAssets` (boolean): redirect through short-lived GitHub asset urls
  (default `true`); when `false`, redirect to the public
  `browser_download_url`

## Download events

`Pecans` is an `EventEmitter`. `beforeDownload` and `afterDownload` fire
around asset serving with a `{req, release, asset}` payload — useful for
download analytics:

```js
pecans.on("afterDownload", ({ req, release, asset }) => {
  console.log(`served ${asset.filename} of ${release.version}`);
});
```

Events are notifications only: return values are ignored, so listeners
cannot approve or deny a download (listeners run synchronously in-process —
keep them fast and wrap risky work in try/catch). The 1.x
`pecans.before("download", fn)` interceptors, which could deny a download,
were removed; put auth in front of the router instead:

```js
app.use("/myapp", requireMyAuth, pecans.router);
```
