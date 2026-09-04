import { prerelease, valid } from "semver";

/**
 * True for the version shapes pecans serves, as semantic-release emits
 * them: X.Y.Z, or X.Y.Z-<channel>.<N> with a named channel and an integer.
 */
export function isReleaseVersion(version: string): boolean {
  if (!valid(version)) return false;
  const ids = prerelease(version);
  if (!ids) return true;
  return (
    ids.length === 2 && typeof ids[0] === "string" && typeof ids[1] === "number"
  );
}
