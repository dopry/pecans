import type { PecansAssetQuery } from "./PecansAssetQuery.js";

export interface PecansReleaseQuery extends PecansAssetQuery {
  channel?: string;
  // version range spec, see: https://github.com/npm/node-semver#ranges
  // On a named prerelease channel the range matches that channel's
  // prereleases across every major.minor.patch tuple (see
  // channelQueryIncludesPrereleases); otherwise default semver semantics.
  version?: string;
}
