import { OperatingSystem } from "./OperatingSystem";

/**
 * Architecture string identifiers
 */
export const ARCHITECTURES = ["32", "64", "arm64", "universal"] as const;
export type Architecture = (typeof ARCHITECTURES)[number];
// check if a string is an architecture identifier
export function isArchitecture(obj: unknown): obj is Architecture {
  return typeof obj == "string" && ARCHITECTURES.includes(obj as Architecture);
}

export function filenameToArchitecture(
  filename: string,
  os: OperatingSystem
): Architecture {
  const name = filename.toLowerCase();
  if (name.includes("universal") || name.includes("univ")) return "universal";
  // do arm64 berfore 64 other wise it will always be 64, since both contain 64
  if (name.includes("arm64") || name.includes("arm")) return "arm64";
  // Detect suffix: 32 or 64
  if (name.includes("32") || name.includes("ia32") || name.includes("i386"))
    return "32";
  if (name.includes("64") || name.includes("x64") || name.includes("amd64"))
    return "64";
  throw new Error(
    `Unable to determine architecture from filename: ${filename}`
  );
}

export function getSupportedArchByOs(os: OperatingSystem): Architecture[] {
  switch (os) {
    case "osx":
      return ["64", "32", "arm64", "universal"];
    case "linux":
    case "windows":
    default:
      return ["32", "64"];
  }
}

export function isValidArchForOS(
  os: OperatingSystem,
  arch: string
): arch is Architecture {
  const supported = getSupportedArchByOs(os);
  return supported.includes(arch as Architecture);
}
