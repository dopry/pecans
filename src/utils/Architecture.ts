import type { OperatingSystem } from "./OperatingSystem.js";

/**
 * Architecture string identifiers
 */
export const ARCHITECTURES = ["32", "64", "arm64", "universal"] as const;
export type Architecture = (typeof ARCHITECTURES)[number];
// check if a string is an architecture identifier
export function isArchitecture(obj: unknown): obj is Architecture {
  return typeof obj == "string" && ARCHITECTURES.includes(obj as Architecture);
}

// Token-delimited arch markers. Bare substring checks misread version
// digits ("MyApp-1.32.0" is not 32-bit), prefixes of wider markers
// ("x86_64" is not x86), and letters inside words ("Charmap" is not an
// arm build). A token is bounded by any non-alphanumeric character,
// including "_" (electron/msix artifacts separate with underscores).
// arm covers arm64 and armv7l-style ids; pecans only models arm64.
const ARM_TOKEN = /(?<![a-z0-9])arm(64|v\d+l?)?(?![a-z0-9])/;
// bare 32/64 additionally exclude a preceding "." so version segments
// ("1.32.0") never read as an arch, while "app-32.exe" still does
const X64_TOKEN =
  /(?<![a-z0-9])(x86_64|x64|amd64|win64)(?![a-z0-9])|(?<![a-z0-9.])64(-?bit)?(?![a-z0-9])/;
const X32_TOKEN =
  /(?<![a-z0-9])(ia32|i386|x86|win32)(?![a-z0-9])|(?<![a-z0-9.])32(-?bit)?(?![a-z0-9])/;

export function filenameToArchitecture(
  filename: string,
  os: OperatingSystem,
): Architecture {
  const name = filename.toLowerCase();
  if (name == "releases") return "universal";
  // .msixbundle is a multi-architecture bundle by definition
  if (name.endsWith(".msixbundle")) return "universal";
  if (name.includes("universal") || name.includes("univ")) return "universal";
  if (ARM_TOKEN.test(name)) return "arm64";
  // 64-bit markers rank above the win32/x86 tokens they ride alongside:
  // electron-packager names artifacts "app-win32-x64", where win32 is the
  // platform id and x64 the actual architecture
  if (X64_TOKEN.test(name)) return "64";
  if (X32_TOKEN.test(name)) return "32";
  // we default to 64 if we don't find anything else since that is the generally
  return "64";
}

export function getSupportedArchByOs(os: OperatingSystem): Architecture[] {
  switch (os) {
    case "osx":
      return ["64", "32", "arm64", "universal"];
    case "windows":
      return ["32", "64", "universal"];
    case "linux":
    default:
      return ["32", "64"];
  }
}

export function isValidArchForOS(
  os: OperatingSystem,
  arch: string,
): arch is Architecture {
  const supported = getSupportedArchByOs(os);
  return supported.includes(arch as Architecture);
}
