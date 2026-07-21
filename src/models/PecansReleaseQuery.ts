import type { PecansAssetQuery } from "./PecansAssetQuery.js";

export interface PecansReleaseQuery extends PecansAssetQuery {
  channel?: string;
  // version range spec, see: https://github.com/npm/node-semver#ranges
  version?: string;
}
