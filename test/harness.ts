import express from "express";
import nock from "nock";
import { GithubRelease } from "../src";
import { Pecans, PecansGitHubBackend, PecansOptions } from "../src";
import { PecansGitHubBackendOpts } from "../src/backends/github";
import { PecansAsset } from "../src/models";
import { nockGithubListReleases } from "./nock/nockGithubListReleases";

/**
 * Shared integration-test harness. Backends are constructed from the
 * env.test.sh variables (owner-nock-mocked / repo-nock-mocked) and all GitHub
 * traffic is intercepted by nock.
 */

export function configurePecansGitHubBackend(
  opts: PecansGitHubBackendOpts = {}
) {
  const env = PecansGitHubBackend.getEnvironment();
  const backend = PecansGitHubBackend.FromEnv(env, opts);
  return { env, backend };
}

export function configurePecansTestApp(
  backend: PecansGitHubBackend,
  opts: PecansOptions = {}
) {
  const pecans = new Pecans(backend, opts);
  const app = express();
  app.use(pecans.router);
  return { pecans, app };
}

/**
 * One-call setup: backend + app with the given releases already mocked on the
 * GitHub list-releases endpoint.
 */
export function configureTestAppWithReleases(
  releases: Partial<GithubRelease>[],
  backendOpts: PecansGitHubBackendOpts = {},
  pecansOpts: PecansOptions = {}
) {
  const { env, backend } = configurePecansGitHubBackend(backendOpts);
  nockGithubListReleases(nock, env.GITHUB_OWNER, env.GITHUB_REPO, releases);
  const { pecans, app } = configurePecansTestApp(backend, pecansOpts);
  return { env, backend, pecans, app };
}

/**
 * Look up a normalized asset by release version + filename, warming the
 * backend cache (consumes the list-releases nock interceptor on first call;
 * subsequent app requests share the cache).
 */
export async function findAsset(
  backend: PecansGitHubBackend,
  version: string,
  filename: string
): Promise<PecansAsset> {
  const releases = await backend.releases();
  const release = releases.getReleases().find((r) => r.version === version);
  if (!release) throw new Error(`fixture release ${version} not found`);
  const asset = release.assets.find((a) => a.filename === filename);
  if (!asset)
    throw new Error(`fixture asset ${filename} not found in ${version}`);
  return asset;
}

/** Browser User-Agent strings for platform-detection tests. */
export const USER_AGENTS = {
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  linux:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};
