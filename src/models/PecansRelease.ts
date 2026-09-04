import { satisfies, valid, validRange } from "semver";
// keep the module graph cycle-free: import specific util modules rather
// than the ../utils barrel
import {
  channelFromVersion,
  channelQueryIncludesPrereleases,
} from "../utils/channelFromVersion.js";
import type { PecansAssetQuery } from "./PecansAssetQuery.js";
import { PecansAsset, type PecansAssetDTO } from "./PecansAsset.js";
import type { PecansReleaseQuery } from "./PecansReleaseQuery.js";

export interface PecansReleaseDTO {
  // version
  assets: PecansAssetDTO[];
  notes: string;
  // missing published_at indicates a draft that hasn't been published.
  published_at: Date;
  version: string;
}

// generic so filtering keeps the caller's TRaw (e.g. the GitHub backend's
// PecansAsset<GithubReleaseAsset>[] survives a .filter(isPecansAsset))
export function isPecansAsset<TRaw = unknown>(
  obj: unknown,
): obj is PecansAsset<TRaw> {
  return obj instanceof PecansAsset;
}

export class PecansRelease implements PecansReleaseDTO {
  assets: PecansAsset[];
  /** always derived from the version's prerelease identifier; a release's
   * channel and version can never disagree (the 1.x DTO channel field was
   * removed in 2.0) */
  channel: string;
  notes: string;
  published_at: Date;
  version: string;

  constructor(dto: PecansReleaseDTO) {
    // every consumer (channel derivation, semver sorting, range matching)
    // assumes a parseable version; an invalid one used to slip through as a
    // "stable" release and then throw inside the PecansReleases sort,
    // taking the whole collection down with it (#80)
    if (!valid(dto.version)) {
      throw new Error(`Invalid semver version (${dto.version})`);
    }
    this.channel = channelFromVersion(dto.version);
    this.assets = dto.assets
      .map((assetDTO) => {
        try {
          const asset = new PecansAsset(assetDTO);
          return asset;
        } catch (err) {
          console.error(
            `Error parsing asset: ${assetDTO.filename} for release ${dto.version}/${this.channel}`,
            err,
          );
        }
      })
      .filter<PecansAsset>(isPecansAsset);
    this.notes = dto.notes;
    this.published_at = dto.published_at;
    this.version = dto.version;
  }

  satisfiesQuery(query: PecansReleaseQuery): boolean {
    return (
      this.satisfiesChannel(query.channel) &&
      this.satisfiesSemVerRange(query.version, {
        includePrerelease: channelQueryIncludesPrereleases(query.channel),
      }) &&
      this.queryAssets(query).length > 0
    );
  }

  queryAssets(query: PecansAssetQuery) {
    return this.assets.filter((asset) => asset.satisfiesQuery(query));
  }

  satisfiesChannel(channel?: string) {
    if (channel == undefined) return true;
    if (channel == "*") return true;
    return this.channel == channel;
  }

  /**
   * True when the version is in the range. With includePrerelease,
   * prereleases match across every major.minor.patch tuple (see
   * channelQueryIncludesPrereleases); by default semver only matches a
   * prerelease inside the tuple of a prerelease comparator.
   */
  satisfiesSemVerRange(
    range?: string,
    opts: { includePrerelease?: boolean } = {},
  ) {
    if (range == undefined) return true;
    // latest isn't actually applicable to single entries.
    // we ignore it here so pre-filtering by other props will still work
    // latest will need to be handled in a post filter.
    if (range == "latest") return true;
    if (!validRange(range)) {
      throw new Error("Invalid Range Specified");
    }
    return satisfies(this.version, range, {
      includePrerelease: opts.includePrerelease ?? false,
    });
  }
}
