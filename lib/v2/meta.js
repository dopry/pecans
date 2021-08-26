import findVersions from "find-versions";

export const ARCH = {
  ARM64: "arm64",
  ARMV7L: "armv7l",
  IA32: "ia32",
  MIPS64EL: "mips64el",
  X64: "x64",
};

export const PLATFORM = {
  LINUX: "linux",
  WIN32: "win32",
  DARWIN: "darwin",
  MAS: "mas",
};

export function filenameToPlatform(filename) {
  const name = filename.toLowerCase();
  // check for windows
  if (name === "releases") return PLATFORM.WIN32;
  if (name.endsWith(".dmg")) return PLATFORM.DARWIN;
  if (name.endsWith(".exe")) return PLATFORM.WIN32;
  if (name.endsWith(".nupkg")) return PLATFORM.WIN32;
  if (name.endsWith(".deb")) return PLATFORM.LINUX;
  if (name.endsWith(".rpm")) return PLATFORM.LINUX;
  if (name.endsWith(".tgz")) return PLATFORM.LINUX;
  if (name.endsWith(".tar.gz")) return PLATFORM.LINUX;

  if (name.includes("darwin")) return PLATFORM.DARWIN;
  if (name.includes("win")) return PLATFORM.WIN32;
  if (name.includes("win32")) return PLATFORM.WIN32;
  if (name.includes("mac")) return PLATFORM.DARWIN;
  if (name.includes("mas")) return PLATFORM.MAS;
  if (name.includes("linux")) return PLATFORM.LINUX;
}

export function filenameToArch(filename) {
  const name = filename.toLowerCase();
  if (name.includes("x64") || name.includes("amd64")) return ARCH.X64;
  if (name.includes("ia32") || name.includes("i386")) return ARCH.IA32;
  if (name.includes("arm64")) return ARCH.ARM64;
  if (name.includes("armv7l")) return ARCH.ARMV7L;
  if (name.includes("mips64el")) return ARCH.MIPS64EL;
  return ARCH.X64;
}

// /(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?/gm
// /(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z][0-9a-zA-Z]*\.(?:0|[1-9]\d*))*))?/gm;

const SEMVER_REGEX = new RegExp(
  /(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[a-zA-Z][0-9a-zA-Z]*\.(?:0|[1-9]\d*))?/gm
);
// extract and normalize versions from a string.
export function stringToVersion(string) {
  const name = string.toLowerCase();
  const versions = name.match(SEMVER_REGEX);

  return versions ? versions[0] : undefined;
}

// extract channel from a version string and strip off .n from end.
export function versionToChannel(versionString) {
  if (!versionString) return "stable";
  const channelRelease = versionString.split("-")[1] || "stable";
  return channelRelease.split(".")[0];
}
