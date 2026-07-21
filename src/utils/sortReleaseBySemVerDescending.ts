import { gt } from "semver";
// keep the module graph cycle-free: import the specific model module
// rather than the ../models barrel (which re-enters this file)
import type { PecansRelease } from "../models/PecansRelease.js";

// Compare two version
export function sortReleaseBySemVerDescending(
  a: PecansRelease,
  b: PecansRelease,
) {
  if (gt(a.version, b.version)) return -1;
  if (gt(b.version, a.version)) return 1;
  return 0;
}
