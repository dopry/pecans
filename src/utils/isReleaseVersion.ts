import { prerelease, valid } from "semver";

/**
 * True for the version shapes pecans serves: X.Y.Z, or X.Y.Z-<channel>.<N>
 * as semantic-release emits them (a named channel, then an integer).
 */
export function isReleaseVersion(version: string): boolean {
  if (!valid(version)) return false;
  const ids = prerelease(version);
  if (!ids) return true;
  return (
    ids.length >= 2 &&
    typeof ids[0] === "string" &&
    typeof ids[ids.length - 1] === "number"
  );
}
