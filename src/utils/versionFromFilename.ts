import { isArchitectureToken } from "./Architecture.js";
import { isReleaseVersion } from "./isReleaseVersion.js";

/**
 * The release version an artifact filename carries, or undefined when it
 * carries none. "app-2.9.0-next.3-x64-full.nupkg" -> "2.9.0-next.3".
 *
 * A version cannot be taken as the trailing part of the name: an arch marker
 * often follows it, and "2.9.0-next.3-x64" parses as valid semver on its own.
 * isReleaseVersion settles where the version ends, since only "X.Y.Z" and
 * "X.Y.Z-<channel>.<N>" qualify.
 *
 * What follows the version must then be arch markers and nothing else. A name
 * carrying a prerelease outside the supported shapes ("app-2.9.0-rc1") reads
 * as no version at all rather than as the stable "2.9.0" sitting inside it.
 */
export function versionFromFilename(filename: string): string | undefined {
  // only an alphabetic extension: ".0" of a bare "app-2.9.0" is a version
  // segment, not a file type
  const stem = filename
    .replace(/\.[a-z]+$/i, "")
    .replace(/-(full|delta)$/i, "");
  const parts = stem.split("-");
  for (let start = 0; start < parts.length; start++) {
    for (let end = parts.length; end > start; end--) {
      if (!isReleaseVersion(parts.slice(start, end).join("-"))) continue;
      if (parts.slice(end).every(isArchitectureToken)) {
        return parts.slice(start, end).join("-");
      }
    }
  }
  return undefined;
}
