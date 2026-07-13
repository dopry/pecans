import { satisfies, validRange } from "semver";
// keep the module graph cycle-free: import specific util modules rather
// than the ../utils barrel
import { channelFromVersion } from "../utils/channelFromVersion";
import { PecansAssetQuery } from "./PecansAssetQuery";
import { PecansAsset, PecansAssetDTO } from "./PecansAsset";
import { PecansReleaseQuery } from "./PecansReleaseQuery";

export interface PecansReleaseDTO {
  // version
  assets: PecansAssetDTO[];
  /**
   * @deprecated ignored - the channel is always derived from the version's
   * prerelease identifier (channelFromVersion), so channel and version can
   * never disagree. Will be removed in 3.0.
   */
  channel: string;
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
  channel: string;
  notes: string;
  published_at: Date;
  version: string;

  constructor(dto: PecansReleaseDTO) {
    // the version string is the single source of truth for the channel;
    // dto.channel is deliberately ignored (see PecansReleaseDTO.channel)
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
      this.satisfiesSemVerRange(query.version) &&
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

  satisfiesSemVerRange(range?: string) {
    if (range == undefined) return true;
    // latest isn't actually applicable to single entries.
    // we ignore it here so pre-filtering by other props will still work
    // latest will need to be handled in a post filter.
    if (range == "latest") return true;
    if (!validRange(range)) {
      throw new Error("Invalid Range Specified");
    }
    return satisfies(this.version, range);
  }
}
