import { OperatingSystem } from "./OperatingSystem";

/**
 * These are based on NODE.js os.arch() values
 * @see: https://nodejs.org/api/os.html#osarch
 */
export const SUPPORTED_ARCHITECTURES = ["arm64", "x32", "x64"] as const;
export type SupportedArchitecture = (typeof SUPPORTED_ARCHITECTURES)[number];
export type SupportedArchitectures = SupportedArchitecture[];

export function isSupportedArchitecture(
  obj: unknown
): obj is SupportedArchitecture {
  return (
    typeof obj == "string" &&
    SUPPORTED_ARCHITECTURES.includes(obj as SupportedArchitecture)
  );
}

export function filenameToSupportedArchitecture(
  filename: string
): SupportedArchitecture[] {
  const name = filename.toLowerCase();
  // this is the squirrel releases file.
  // TODO: update to RELEASES-{arch} and modify pecans to have architecture specific release endpoints.
  // TODO: Explore aggregating RELEASES from multiple Github Releases into a single release file and how that may interact with deltas.
  if (name == "releases") return ["x32", "x64"];

  // use Set so we only have unique values.
  const archs: Set<SupportedArchitecture> = new Set();
  if (name.includes("arm64")) archs.add("arm64");
  if (name.includes("x32")) archs.add("x32");
  if (name.includes("x64")) archs.add("x64");
  if (name.includes("universal") || name.includes("univ")) {
    archs.add("x64");
    archs.add("arm64");
  }
  // convert set to array
  return [...archs];
}

// convert a url query or param to a supported architecture array to be used with a PecansAssetQuery.
export function paramToSupportedArchitectures(
  param: string
): SupportedArchitecture[] {
  const p = param.toLowerCase();
  // map osx universal to internal actual architectures.
  if (p == "universal" || p == "univ") return ["x64", "arm64"];
  if (isSupportedArchitecture(p)) return [p];
  return [];
}

/**
 * Architecture string identifiers
 */
// @deprecated
export const ARCHITECTURES = ["32", "64", "arm64", "universal"] as const;
// @deprecated
export type Architecture = (typeof ARCHITECTURES)[number];

// check if a string is an architecture identifier
// @deprecated
export function isArchitecture(obj: unknown): obj is Architecture {
  return typeof obj == "string" && ARCHITECTURES.includes(obj as Architecture);
}

// deprecated
export function filenameToArchitectureLegacy(filename: string): Architecture {
  const name = filename.toLowerCase();
  if (name == "releases") return "universal";
  if (name.includes("universal") || name.includes("univ")) return "universal";
  // do arm64 berfore 64 other wise it will always be 64, since both contain 64
  if (name.includes("arm64")) return "arm64";
  // technically this should be just arm.... but that platform isn't very common in desktops other than rpi.
  if (name.includes("arm")) return "arm64";
  // Detect suffix: 32 or 64
  if (
    name.includes("32") ||
    name.includes("ia32") ||
    name.includes("i386") ||
    name.includes("x86")
  )
    return "32";
  // we default to 64 if we don't find anything else since that is the generally
  return "64";
}
