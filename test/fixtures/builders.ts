import { createHash } from "node:crypto";
import type { GithubRelease, GithubReleaseAsset } from "../../src/index.js";
import {
  mock_github_asset,
  mock_github_release,
  type MockGithubAssetOpts,
} from "../nock/nockGithubListReleases.js";

/**
 * Composable fixture builders on top of the low-level test/nock mocks.
 *
 * The naming convention `app-<version>-<variant>.<ext>` matches what the
 * platform-detection code in src/utils expects (see filenameToOperatingSystem,
 * filenameToArchitecture, filenameToPackageFormat).
 */

export interface BuildReleaseOpts {
  owner: string;
  repo: string;
  /** semver version, without the leading v (the tag gets `v` prefixed) */
  version: string;
  /** release notes body; defaults to "Notes for <version>" */
  notes?: string | null;
  assets: Partial<GithubReleaseAsset>[];
  draft?: boolean;
  prerelease?: boolean;
  /** ISO timestamp; defaults to a deterministic date derived from the version */
  published_at?: string;
}

/**
 * Deterministic publish date so channel-latest logic (which compares
 * published_at) can be asserted without millisecond races between mocks:
 * days-since-epoch offset by major*10000 + minor*100 + patch.
 */
export function publishedAtForVersion(version: string): string {
  const [major, minor, patch] = version
    .split("-")[0]
    .split(".")
    .map((part) => parseInt(part, 10));
  const days = major * 10000 + minor * 100 + patch;
  const date = new Date(Date.UTC(2020, 0, 1) + days * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

export function buildRelease(opts: BuildReleaseOpts): Partial<GithubRelease> {
  const notes =
    opts.notes === undefined ? `Notes for ${opts.version}` : opts.notes;
  const published_at = opts.published_at ?? publishedAtForVersion(opts.version);
  return mock_github_release(
    opts.owner,
    opts.repo,
    `v${opts.version}`,
    opts.assets,
    opts.draft ?? false,
    opts.prerelease ?? false,
    notes,
    published_at,
  );
}

export function buildAsset(
  owner: string,
  repo: string,
  filename: string,
  opts: MockGithubAssetOpts = {},
): Partial<GithubReleaseAsset> {
  return mock_github_asset(owner, repo, filename, opts);
}

/** macOS assets: dmg + zip for x64, arm64, and universal. */
export function buildMacAssets(owner: string, repo: string, version: string) {
  return [
    buildAsset(owner, repo, `app-${version}-x64.dmg`),
    buildAsset(owner, repo, `app-${version}-x64-mac.zip`),
    buildAsset(owner, repo, `app-${version}-arm64.dmg`),
    buildAsset(owner, repo, `app-${version}-arm64-mac.zip`),
    buildAsset(owner, repo, `app-${version}-univ.dmg`),
    buildAsset(owner, repo, `app-${version}-univ-mac.zip`),
  ];
}

/** Windows assets: NSIS-style setup.exe + Squirrel full/delta nupkgs. */
export function buildWindowsAssets(
  owner: string,
  repo: string,
  version: string,
) {
  return [
    buildAsset(owner, repo, `app-${version}-x64-setup.exe`),
    buildAsset(owner, repo, `app-${version}-x64-full.nupkg`, {
      size: SQUIRREL_NUPKG_SIZE,
    }),
    buildAsset(owner, repo, `app-${version}-x64-delta.nupkg`, {
      size: SQUIRREL_DELTA_SIZE,
    }),
  ];
}

/** Linux assets: tar.gz + deb + rpm, all x64. */
export function buildLinuxAssets(owner: string, repo: string, version: string) {
  return [
    buildAsset(owner, repo, `app-${version}-linux-x64.tar.gz`),
    buildAsset(owner, repo, `app-${version}-linux-x64.deb`),
    buildAsset(owner, repo, `app-${version}-linux-x64.rpm`),
  ];
}

/** Every platform + a Squirrel.Windows RELEASES asset. */
export function buildFullPlatformAssets(
  owner: string,
  repo: string,
  version: string,
) {
  return [
    ...buildMacAssets(owner, repo, version),
    ...buildWindowsAssets(owner, repo, version),
    ...buildLinuxAssets(owner, repo, version),
    buildAsset(owner, repo, "RELEASES", {
      size: 200,
      content_type: "application/octet-stream",
    }),
  ];
}

/**
 * Standard stable-only release set: 2.7.0 > 2.6.0 > 2.5.0, each with the
 * full platform asset matrix. Use for download/update happy paths where a
 * prerelease would change which version is "latest".
 */
export function buildStableReleaseSet(owner: string, repo: string) {
  return ["2.7.0", "2.6.0", "2.5.0"].map((version) =>
    buildRelease({
      owner,
      repo,
      version,
      assets: buildFullPlatformAssets(owner, repo, version),
    }),
  );
}

/**
 * Mixed-channel release set: the stable set plus 2.8.0-beta.1/2 on the beta
 * channel. Note 2.8.0-beta.2 is the highest semver overall, which several
 * routes surface when they resolve with channel "*".
 */
export function buildMixedChannelReleaseSet(owner: string, repo: string) {
  const beta = ["2.8.0-beta.2", "2.8.0-beta.1"].map((version) =>
    buildRelease({
      owner,
      repo,
      version,
      prerelease: true,
      assets: buildFullPlatformAssets(owner, repo, version),
    }),
  );
  return [...beta, ...buildStableReleaseSet(owner, repo)];
}

// Sizes referenced by the RELEASES fixture below; kept in sync between the
// asset mocks and the RELEASES file content.
export const SQUIRREL_NUPKG_SIZE = 143940252;
export const SQUIRREL_DELTA_SIZE = 1494002;

export interface SquirrelReleasesEntry {
  filename: string;
  size: number;
  sha?: string;
}

/** Deterministic fake SHA1 for a filename (40 hex chars, as Squirrel emits). */
export function fakeSha1(filename: string): string {
  return createHash("sha1").update(filename).digest("hex").toUpperCase();
}

/**
 * Render Squirrel.Windows RELEASES file content:
 * one `<SHA1> <filename> <size>` line per entry, LF separated, no BOM.
 */
export function buildRELEASESContent(entries: SquirrelReleasesEntry[]): string {
  return entries
    .map((e) => [e.sha ?? fakeSha1(e.filename), e.filename, e.size].join(" "))
    .join("\n");
}

/** RELEASES content matching buildWindowsAssets(version): full + delta nupkg. */
export function buildRELEASESContentForVersion(version: string): string {
  return buildRELEASESContent([
    {
      filename: `app-${version}-x64-delta.nupkg`,
      size: SQUIRREL_DELTA_SIZE,
    },
    {
      filename: `app-${version}-x64-full.nupkg`,
      size: SQUIRREL_NUPKG_SIZE,
    },
  ]);
}
