import { Backend } from "./backends/";
import { NotFoundError } from "./errors";
import { PecansAssetDTO } from "./models/PecansAsset";
import { PecansRelease, PecansReleaseDTO } from "./models/PecansRelease";
import { PecansReleaseQuery } from "./models/PecansReleaseQuery";
import { PecansReleases } from "./models/PecansReleases";
// import from the specific util modules, not the ./utils barrel - the barrel
// re-exports resolveForVersion, whose deprecation adapter imports this module
import { Architecture } from "./utils/Architecture";
import { OperatingSystem } from "./utils/OperatingSystem";
import { PackageFormat } from "./utils/PackageFormat";
import { parsePlatform, Platform } from "./utils/platforms";
import {
  getSupportedExt,
  SUPPORTED_FILE_EXTENSIONS,
  SupportedFileExtension,
} from "./utils/SupportedFileExtension";
import { sortReleaseBySemVerDescending } from "./utils/sortReleaseBySemVerDescending";

/**
 * Discrete criteria for resolving a downloadable release. Unlike the strict
 * structural PecansReleaseQuery, this carries download semantics: RELEASES
 * manifest assets don't count as availability, osx queries can widen to
 * universal builds, and version "latest" collapses to the newest match.
 */
export interface ReleaseFilter {
  /** undefined or "*" = any channel */
  channel?: string;
  /** "latest" or a semver range; undefined = any */
  version?: string;
  os?: OperatingSystem;
  /** undefined = any architecture */
  arch?: Architecture;
  /** undefined = any package format; null = only assets without one */
  pkg?: PackageFormat | null;
  /** accept osx universal builds for any osx arch; defaults to the service option */
  preferUniversal?: boolean;
}

/** Discrete criteria for picking one asset out of a release. */
export interface AssetFilter {
  os?: OperatingSystem;
  arch?: Architecture;
  pkg?: PackageFormat | null;
  /** extension to prefer (e.g. ".zip"); others remain as fallbacks */
  wanted?: SupportedFileExtension;
  /** accept osx universal builds for any osx arch */
  preferUniversal?: boolean;
}

/**
 * True when an asset's composite platform id satisfies the discrete
 * criteria. Works off the composite `type` (present on plain DTOs) so it
 * matches exactly what the legacy prefix matching matched, without needing
 * a constructed PecansAsset. With preferUniversal, an osx universal build
 * satisfies any requested arch when the filter targets osx.
 */
export function assetMatchesPlatform(
  type: Platform,
  filter: AssetFilter,
): boolean {
  const asset = parsePlatform(type);
  if (filter.os && asset.os !== filter.os) return false;
  if (filter.pkg === null) {
    if (asset.pkg !== undefined) return false;
  } else if (filter.pkg && asset.pkg !== filter.pkg) {
    return false;
  }
  if (filter.arch && asset.arch !== filter.arch) {
    // widening requires the FILTER to target osx - an arch-only filter must
    // not be satisfied by universal osx builds (the asset os is already
    // known to equal filter.os from the check above)
    const universalSatisfies =
      filter.preferUniversal &&
      filter.os === "osx" &&
      asset.arch === "universal";
    if (!universalSatisfies) return false;
  }
  return true;
}

/**
 * Pick the best asset of a release for the discrete criteria: filter to
 * supported extensions and matching platform, then rank by platform
 * specificity and extension preference. This is the single home of the
 * prefer-universal policy (previously duplicated in versions.ts and
 * resolveForVersion.ts). Returns the matching asset object as-is.
 */
export function resolveAssetForRelease(
  release: PecansReleaseDTO,
  filter: AssetFilter,
): PecansAssetDTO | undefined {
  const prefs: string[] = [...SUPPORTED_FILE_EXTENSIONS];
  // Put wanted at the top of the list... will fallback to other extensions.
  if (filter.wanted) prefs.unshift(filter.wanted);

  const candidates = release.assets.filter((asset) => {
    const ext = getSupportedExt(asset.filename) || "";
    return prefs.includes(ext) && assetMatchesPlatform(asset.type, filter);
  });

  const sorted = candidates.sort((a1, a2) => {
    // more specific composite platform ids win ("osx_universal" >
    // "osx_arm64" > "osx_64" > "osx") - legacy ordering preserved verbatim;
    // candidates are already narrowed to the requested platform, so this
    // only breaks ties among acceptable builds
    if (a1.type.length > a2.type.length) return -1;
    if (a2.type.length > a1.type.length) return 1;

    // getSupportedExt handles the ".tar.gz" double extension, which
    // path.extname would report as ".gz" (mis-ranking it to -1)
    const ext1 = getSupportedExt(a1.filename) ?? "";
    const ext2 = getSupportedExt(a2.filename) ?? "";
    return prefs.indexOf(ext1) - prefs.indexOf(ext2);
  });
  return sorted[0];
}

/**
 * Unified release/asset resolution pipeline on the discrete
 * {os, arch, pkg, extensions} model. Wraps a Backend; all route handlers and
 * the deprecated Versions/resolveReleaseAssetForVersion adapters resolve
 * through this single path. Legacy composite platform ids ("osx_64") are
 * translated at the HTTP edge via platformToQuery.
 */
export class ReleaseService {
  constructor(
    protected backend: Backend,
    protected opts: { preferUniversal?: boolean } = {},
  ) {}

  /** The backend's (cached) release collection. */
  async getReleases(): Promise<PecansReleases> {
    return this.backend.releases();
  }

  /** All releases, newest first. */
  async list(): Promise<PecansRelease[]> {
    const releases = await this.getReleases();
    return releases.getReleases().sort(sortReleaseBySemVerDescending);
  }

  /**
   * Strict structural query (channel/version/os/arch/pkg/filename/extensions
   * all match literally). Used by the /dl and /notes surfaces.
   */
  async queryReleases(query: PecansReleaseQuery): Promise<PecansRelease[]> {
    const releases = await this.getReleases();
    return releases.queryReleases(query);
  }

  /**
   * Download-semantics query: releases on the channel, with a non-RELEASES
   * asset available for the discrete platform, in the version range. With
   * version "latest" the newest match is returned alone.
   */
  async filterReleases(filter: ReleaseFilter): Promise<PecansRelease[]> {
    const releases = await this.list();
    const preferUniversal = filter.preferUniversal ?? this.preferUniversal();

    // pkg: null is an explicit constraint ("no package format"), so only
    // undefined means unconstrained
    const platformConstrained =
      filter.os !== undefined ||
      filter.arch !== undefined ||
      filter.pkg !== undefined;

    const matches = releases.filter((release) => {
      if (!release.satisfiesChannel(filter.channel)) return false;
      if (platformConstrained) {
        const available = release.assets.some(
          (asset) =>
            // the Squirrel.Windows manifest is metadata, not a download
            asset.filename !== "RELEASES" &&
            assetMatchesPlatform(asset.type, { ...filter, preferUniversal }),
        );
        if (!available) return false;
      }
      return release.satisfiesSemVerRange(filter.version);
    });

    if (matches.length > 1 && filter.version == "latest") {
      // releases are sorted newest first
      return [matches[0]];
    }
    return matches;
  }

  /** First release matching the filter; throws NotFoundError when none do. */
  async resolveRelease(filter: ReleaseFilter): Promise<PecansRelease> {
    const matches = await this.filterReleases(filter);
    if (matches.length === 0) {
      throw new NotFoundError("Release not found: " + JSON.stringify(filter));
    }
    return matches[0];
  }

  /** Best asset of the release for the discrete criteria. */
  resolveAsset(
    release: PecansReleaseDTO,
    filter: AssetFilter,
  ): PecansAssetDTO | undefined {
    // ?? (not spread order) so an explicit preferUniversal: undefined still
    // falls back to the service default, matching filterReleases
    return resolveAssetForRelease(release, {
      ...filter,
      preferUniversal: filter.preferUniversal ?? this.preferUniversal(),
    });
  }

  protected preferUniversal(): boolean {
    return this.opts.preferUniversal ?? true;
  }
}
