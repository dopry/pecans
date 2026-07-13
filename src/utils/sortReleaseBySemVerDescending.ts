import { gt } from "semver";
// direct module import to stay out of the ../models barrel, which would
// re-enter this file through models/PecansReleases (import cycle)
import { PecansRelease } from "../models/PecansRelease";

// Compare two version
export function sortReleaseBySemVerDescending(
  a: PecansRelease,
  b: PecansRelease,
) {
  if (gt(a.version, b.version)) return -1;
  if (gt(b.version, a.version)) return 1;
  return 0;
}
