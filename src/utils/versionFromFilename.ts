import { isReleaseVersion } from "./isReleaseVersion.js";

/**
 * The release version an artifact filename carries, or undefined when it
 * carries none. "app-2.9.0-next.3-x64-full.nupkg" -> "2.9.0-next.3".
 *
 * A version cannot be taken as the trailing part of the name: an arch marker
 * often follows it, and "2.9.0-next.3-x64" parses as valid semver on its own.
 * isReleaseVersion settles it, since only "X.Y.Z" and "X.Y.Z-<channel>.<N>"
 * qualify, so the longest run of dash-separated parts that satisfies it is
 * the version.
 */
export function versionFromFilename(filename: string): string | undefined {
  const stem = filename.replace(/\.[^.]+$/, "").replace(/-(full|delta)$/i, "");
  const parts = stem.split("-");
  let version: string | undefined;
  for (let start = 0; start < parts.length; start++) {
    for (let end = parts.length; end > start; end--) {
      const candidate = parts.slice(start, end).join("-");
      if (!isReleaseVersion(candidate)) continue;
      if (!version || candidate.length > version.length) version = candidate;
      break;
    }
  }
  return version;
}
