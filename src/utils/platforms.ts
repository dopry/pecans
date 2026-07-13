import {
  Architecture,
  filenameToArchitecture,
  isArchitecture,
} from "./Architecture";
import {
  filenameToOperatingSystem,
  isOperatingSystem,
  OperatingSystem,
} from "./OperatingSystem";
import {
  filenameToPackageFormat,
  isPackageFormat,
  PackageFormat,
} from "./PackageFormat";

// platform identifier
// {{os}}_{{packaging system}}_{{arch}}
// TODO: refactor so resolution works off of discrete os, arch, pkg rather than these composite strings.
export const PLATFORMS = [
  "linux",
  "linux_32",
  "linux_64",
  "linux_rpm",
  "linux_rpm_32",
  "linux_rpm_64",
  "linux_deb",
  "linux_deb_32",
  "linux_deb_64",
  "osx",
  "osx_universal",
  "osx_32",
  "osx_64",
  "osx_arm64",
  "windows",
  "windows_32",
  "windows_64",
] as const;

export type Platform = (typeof PLATFORMS)[number];

export const platforms: Record<string, Platform> = {
  // key must be uppercase version of value
  LINUX: "linux",
  LINUX_32: "linux_32",
  LINUX_64: "linux_64",
  LINUX_RPM: "linux_rpm",
  LINUX_RPM_32: "linux_rpm_32",
  LINUX_RPM_64: "linux_rpm_64",
  LINUX_DEB: "linux_deb",
  LINUX_DEB_32: "linux_deb_32",
  LINUX_DEB_64: "linux_deb_64",
  OSX: "osx",
  OSX_32: "osx_32",
  OSX_64: "osx_64",
  OSX_ARM64: "osx_arm64",
  OSX_UNIVERSAL: "osx_universal",
  WINDOWS: "windows",
  WINDOWS_32: "windows_32",
  WINDOWS_64: "windows_64",
};

// legacy arch suffixes,
// 32 = 32, ia32, i386
// 64 = 64, x64, amd64
// arm64 = arm64
export const legacyPlatformMap: Record<string, Platform> = {
  osx: platforms.OSX_64,
  "osx-x64": platforms.OSX_64,
  "osx-amd64": platforms.OSX_64,
  "osx-arm64": platforms.OSX_ARM64,
  darwin: platforms.OSX_64,
  "darwin-x64": platforms.OSX_64,
  "darwin-amd64": platforms.OSX_64,
  "darwin-arm64": platforms.OSX_ARM64,
  mac: platforms.OSX_64,
  "mac-amd64": platforms.OSX_64,
  "mac-x64": platforms.OSX_64,
  "mac-arm64": platforms.OSX_ARM64,
  win: platforms.WINDOWS_64,
  "win-32": platforms.WINDOWS_32,
  "win-i386": platforms.WINDOWS_32,
  "win-ia32": platforms.WINDOWS_32,
  "win-x64": platforms.WINDOWS_64,
  "win-amd64": platforms.WINDOWS_64,
  win32: platforms.WINDOWS_32,
  "win32-x64": platforms.WINDOWS_64,
  "win32-amd64": platforms.WINDOWS_64,
};

export function mapLegacyPlatform(platform: string): string {
  return legacyPlatformMap[platform] || platform;
}

export function isPlatform(obj: unknown): obj is Platform {
  return typeof obj == "string" && PLATFORMS.includes(obj as Platform);
}

/** The discrete parts of a composite platform id. */
export interface PlatformParts {
  os: OperatingSystem;
  /** undefined when the id has no arch segment ("linux", "linux_deb") */
  arch?: Architecture;
  /** undefined when the id has no package segment */
  pkg?: PackageFormat;
}

/** Split a composite platform id ("linux_deb_64") into its discrete parts. */
export function parsePlatform(platform: Platform): PlatformParts {
  const [os, ...rest] = platform.split("_");
  if (!isOperatingSystem(os)) {
    // unreachable for the Platform union; guards runtime casts
    throw new Error(`Unrecognized OS in platform string (${platform})`);
  }
  return {
    os,
    arch: rest.find(isArchitecture),
    pkg: rest.find(isPackageFormat),
  };
}

/**
 * Package-format criterion for download resolution. An asset without an
 * alternate package format (deb/rpm) IS the platform's default package
 * (tarball, dmg, setup.exe); "default" selects exactly those. Omitted =
 * unconstrained.
 */
export type PackageFormatQuery = PackageFormat | "default";

/** Discrete query equivalent of a composite platform id. */
export interface DiscretePlatformQuery {
  os: OperatingSystem;
  /** undefined = any architecture */
  arch?: Architecture;
  /** undefined = any package format; "default" = the platform default only */
  pkg?: PackageFormatQuery;
}

/**
 * Translate a composite platform id ("linux_deb_64") into the discrete
 * {os, arch, pkg} query the resolution pipeline works on. This encodes the
 * legacy prefix-matching semantics exactly:
 * - a bare os ("linux") matches any arch and any package format
 * - an os+arch id ("linux_64") means the platform's DEFAULT package - the
 *   tarball, never deb/rpm ("linux_deb_64" never matched the "linux_64"
 *   prefix) - hence pkg: "default"
 * - an os+pkg id ("linux_deb") matches that alternate format on any arch
 */
export function platformToQuery(platform: Platform): DiscretePlatformQuery {
  const { os, arch, pkg } = parsePlatform(platform);
  return {
    os,
    arch,
    pkg: pkg ?? (os === "linux" && arch ? "default" : undefined),
  };
}

// Reduce a platform id to its OS,
export function platformToType(platform: Platform): OperatingSystem {
  const [os] = platform.split("_");
  if (isOperatingSystem(os)) return os;
  // if our typeguards are working and ts compiles without error,
  // we shouldn't get here... but just in case we do, throw and error.
  throw new Error("Unrecognized OS in platform string");
}

export function filenameToPlatform(filename: string): Platform {
  const name = filename.toLowerCase();
  // Detect NuGet/Squirrel.Windows files
  if (name == "releases" || name.endsWith(".nupkg"))
    return platforms.WINDOWS_64;

  const parts: string[] = [];
  const os = filenameToOperatingSystem(name);
  parts.push(os);
  const pkg = filenameToPackageFormat(name);
  // pkg is optional and typically only with linux.
  if (pkg) parts.push(pkg);
  const arch = filenameToArchitecture(name, os);
  parts.push(arch);
  const platformKey = parts.join("_").toUpperCase();
  return platforms[platformKey];
}
