import { describe, it, expect } from "vitest";
import { PecansReleaseDTO } from "../../src/models";
import { filenameToOperatingSystem } from "../../src/utils/OperatingSystem";
import {
  Architecture,
  filenameToPlatform,
  OperatingSystem,
  PackageFormat,
  Platform,
  platforms,
  platformToType,
  mapLegacyPlatform,
  isPlatform,
} from "../../src/utils";
import { resolveReleaseAssetForVersion } from "../../src/utils/resolveForVersion";
import { filenameToPackageFormat } from "../../src/utils/PackageFormat";
import { filenameToArchitecture } from "../../src/utils/Architecture";
import { SupportedFileExtension } from "../../src/utils/SupportedFileExtension";

type FilenameResolveTestTuple = [
  filename: string,
  os: OperatingSystem,
  /** null means it will throw */
  arch: Architecture | null,
  pkg: PackageFormat | undefined,
  /** null means it will throw */
  platform: Platform | null
];

const release: PecansReleaseDTO = {
  version: "v3.3.1",
  channel: "stable",
  published_at: new Date(),
  notes: "",
  assets: [
    {
      id: "1",
      type: "osx_64",
      filename: "test-3.3.1-darwin.dmg",
      size: 1457531,
      content_type: "application/zip",
      raw: {},
    },
    {
      id: "2",
      type: "osx_64",
      filename: "test-3.3.1-darwin-x64.zip",
      size: 1457531,
      content_type: "application/zip",
      raw: {},
    },
    {
      id: "2",
      type: "osx_arm64",
      filename: "test-3.3.1-darwin-arm64.dmg",
      size: 1457531,
      content_type: "application/zip",
      raw: {},
    },
    {
      id: "2",
      type: "osx_arm64",
      filename: "test-3.3.1-darwin-arm64.zip",
      size: 1457531,
      content_type: "application/zip",
      raw: {},
    },
    {
      id: "2",
      type: "osx_universal",
      filename: "test-3.3.1-darwin-universal.zip",
      size: 1457531,
      content_type: "application/zip",
      raw: {},
    },
    {
      id: "2",
      type: "osx_universal",
      filename: "test-3.3.1-darwin-universal.dmg",
      size: 1457531,
      content_type: "application/zip",
      raw: {},
    },
    {
      id: "2",
      type: "windows_32",
      filename: "atom-1.0.9-delta.nupkg",
      size: 1457531,
      content_type: "application/zip",
      raw: {},
    },
    {
      id: "2",
      type: "windows_32",
      filename: "atom-1.0.9-full.nupkg",
      size: 78181725,
      content_type: "application/zip",
      raw: {},
    },
    {
      id: "2",
      type: "linux_32",
      filename: "atom-ia32.tar.gz",
      size: 71292506,
      content_type: "application/zip",
      raw: {},
    },
    {
      id: "2",
      type: "linux_64",
      filename: "atom-amd64.tar.gz",
      size: 71292506,
      content_type: "application/zip",
      raw: {},
    },
    {
      id: "2",
      type: "linux_rpm_32",
      filename: "atom-ia32.rpm",
      size: 71292506,
      content_type: "application/zip",
      raw: {},
    },
    {
      id: "2",
      type: "linux_rpm_64",
      filename: "atom-amd64.rpm",
      size: 71292506,
      content_type: "application/zip",
      raw: {},
    },
    {
      id: "2",
      type: "linux_deb_32",
      filename: "atom-ia32.deb",
      size: 71292506,
      content_type: "application/zip",
      raw: {},
    },
    {
      id: "1",
      type: "linux_deb_64",
      filename: "atom-amd64.deb",
      size: 71292506,
      content_type: "application/zip",
      raw: {},
    },
    {
      id: "1",
      type: "windows_32",
      filename: "atom-windows.zip",
      size: 79815714,
      content_type: "application/zip",
      raw: {},
    },
    {
      id: "1",
      type: "windows_32",
      filename: "AtomSetup.exe",
      size: 78675720,
      content_type: "application/zip",
      raw: {},
    },
  ],
};
const tests: FilenameResolveTestTuple[] = [
  ["myapp-v0.25.1-darwin-x64.zip", "osx", "64", undefined, platforms.OSX_64],
  ["myapp.dmg", "osx", "64", undefined, null],
  ["myapp-arm.dmg", "osx", "arm64", undefined, platforms.OSX_ARM64],
  [
    "myapp-v0.25.1-darwin-universal.zip",
    "osx",
    "universal",
    undefined,
    platforms.OSX_UNIVERSAL,
  ],
  [
    "myapp-osx-univ.zip",
    "osx",
    "universal",
    undefined,
    platforms.OSX_UNIVERSAL,
  ],
  [
    "myapp-universal.dmg",
    "osx",
    "universal",
    undefined,
    platforms.OSX_UNIVERSAL,
  ],
  [
    "myapp-v0.25.1-win32-ia32.zip",
    "windows",
    "32",
    undefined,
    platforms.WINDOWS_32,
  ],
  ["atom-1.0.9-delta.nupkg", "windows", "64", undefined, null],
  ["RELEASES", "windows", "universal", undefined, null],
  ["enterprise-amd64.tar.gz", "linux", "64", undefined, platforms.LINUX_64],
  ["enterprise-amd64.tgz", "linux", "64", undefined, platforms.LINUX_64],
  ["enterprise-ia32.tar.gz", "linux", "32", undefined, platforms.LINUX_32],
  ["enterprise-ia32.tgz", "linux", "32", undefined, platforms.LINUX_32],
  ["atom-ia32.deb", "linux", "32", "deb", platforms.LINUX_DEB_32],
  ["atom-amd64.deb", "linux", "64", "deb", platforms.LINUX_DEB_64],
  ["atom-ia32.rpm", "linux", "32", "rpm", platforms.LINUX_RPM_32],
  ["atom-amd64.rpm", "linux", "64", "rpm", platforms.LINUX_RPM_64],
];

const fileNameByPlatformTests: [platform: Platform, filename: string][] = [
  [platforms.OSX_UNIVERSAL, "test-3.3.1-darwin-universal.dmg"],
  ["osx_64", "test-3.3.1-darwin.dmg"],
  ["osx_arm64", "test-3.3.1-darwin-arm64.dmg"],
  ["windows_32", "AtomSetup.exe"],
  ["linux_64", "atom-amd64.tar.gz"],
  ["linux_32", "atom-ia32.tar.gz"],
  ["linux_rpm_32", "atom-ia32.rpm"],
  ["linux_rpm_64", "atom-amd64.rpm"],
  ["linux_deb_32", "atom-ia32.deb"],
  ["linux_deb_64", "atom-amd64.deb"],
];

const fileNameByPlatformUniversalTests: [
  platform: Platform,
  filename: string
][] = [
  [platforms.OSX, "test-3.3.1-darwin-universal.dmg"],
  [platforms.OSX_UNIVERSAL, "test-3.3.1-darwin-universal.dmg"],
  [platforms.OSX_64, "test-3.3.1-darwin-universal.dmg"],
  [platforms.OSX_ARM64, "test-3.3.1-darwin-universal.dmg"],
  [platforms.WINDOWS_32, "AtomSetup.exe"],
  [platforms.LINUX_64, "atom-amd64.tar.gz"],
  [platforms.LINUX_32, "atom-ia32.tar.gz"],
  [platforms.LINUX_RPM_32, "atom-ia32.rpm"],
  [platforms.LINUX_RPM_64, "atom-amd64.rpm"],
  [platforms.LINUX_DEB_32, "atom-ia32.deb"],
  [platforms.LINUX_DEB_64, "atom-amd64.deb"],
];

const fileNameByPlatformAndExtTests: [
  platform: Platform,
  ext: SupportedFileExtension,
  filename: string
][] = [
  ["osx_64", ".zip", "test-3.3.1-darwin-x64.zip"],
  ["osx_arm64", ".zip", "test-3.3.1-darwin-arm64.zip"],
  [platforms.OSX_UNIVERSAL, ".zip", "test-3.3.1-darwin-universal.zip"],
  [platforms.OSX_UNIVERSAL, ".dmg", "test-3.3.1-darwin-universal.dmg"],
];

const fileNameByPlatformAndExtUniversalTests: [
  platform: Platform,
  ext: SupportedFileExtension,
  filename: string
][] = [
  [platforms.OSX, ".zip", "test-3.3.1-darwin-universal.zip"],
  [platforms.OSX_UNIVERSAL, ".zip", "test-3.3.1-darwin-universal.zip"],
  [platforms.OSX_64, ".zip", "test-3.3.1-darwin-universal.zip"],
  [platforms.OSX_ARM64, ".zip", "test-3.3.1-darwin-universal.zip"],
  [platforms.OSX, ".dmg", "test-3.3.1-darwin-universal.dmg"],
  [platforms.OSX_UNIVERSAL, ".dmg", "test-3.3.1-darwin-universal.dmg"],
  [platforms.OSX_64, ".dmg", "test-3.3.1-darwin-universal.dmg"],
  [platforms.OSX_ARM64, ".dmg", "test-3.3.1-darwin-universal.dmg"],
];

describe("Platforms", function () {
  describe("filenameToOperatingSystem", () => {
    tests.forEach(([filename, os, arch, pkg]) => {
      it(`resolves ${filename} to operating system ${os}`, () => {
        expect(filenameToOperatingSystem(filename)).toBe(os);
      });
    });
  });

  describe("filenameToArchitecture", () => {
    tests.forEach(([filename, os, arch, pkg]) => {
      it(`resolves ${filename} to architecture ${arch}`, () => {
        const os = filenameToOperatingSystem(filename);
        if (arch === null) {
          // expect an error
          expect(() => {
            filenameToArchitecture(filename, os);
          }).toThrow();
        } else {
          expect(filenameToArchitecture(filename, os)).toBe(arch);
        }
      });
    });
  });

  describe("filenameToPackageFormat", () => {
    tests.forEach(([filename, os, arch, pkg]) => {
      it(`resolves ${filename} to pkg format ${pkg}`, () => {
        const target = filenameToPackageFormat(filename);
        expect(target).toBe(pkg);
      });
    });
  });

  describe("filenameToPlatform", function () {
    tests.forEach(([filename, os, arch, pkg, platform]) => {
      it(`resolves ${filename} to platform ${platform}`, () => {
        if (platform === null) {
          // expect an error
          try {
            filenameToPlatform(filename);
            throw new Error("Expected an error");
          } catch (err) {
            // pass
          }
        } else {
          const target = filenameToPlatform(filename);
          expect(target).toBe(platform);
        }
      });
    });
  });

  describe("resolveReleaseAssetForVersion", function () {
    fileNameByPlatformTests.forEach(([platform, filename]) => {
      it(`resolves ${platform} to ${filename}`, () => {
        const target = resolveReleaseAssetForVersion(release, platform, false);
        expect(target.filename).toBe(filename);
      });
    });
    fileNameByPlatformAndExtTests.forEach(([platform, ext, filename]) => {
      it(`resolves ${platform}, ${ext} to ${filename}`, () => {
        const target = resolveReleaseAssetForVersion(
          release,
          platform,
          false,
          ext
        );
        expect(target.filename).toBe(filename);
      });
    });
  });

  describe("resolveReleaseAssetForVersion with preferUniversal", function () {
    // test that we resolve to universal assets when preferUniversal is true
    fileNameByPlatformUniversalTests.forEach(([platform, filename]) => {
      it(`resolves ${platform} to ${filename}`, () => {
        const target = resolveReleaseAssetForVersion(release, platform, true);
        expect(target.filename).toBe(filename);
      });
    });

    // test that we fall back to conventional assets when universal are not available
    const releaseWithoutUniversal = {
      ...release,
      assets: release.assets.filter((asset) => asset.type !== "osx_universal"),
    };
    fileNameByPlatformTests.forEach(([platform, filename]) => {
      it(`resolves ${platform} to ${filename}`, () => {
        const target = resolveReleaseAssetForVersion(
          releaseWithoutUniversal,
          platform,
          true
        );
        if (platform === platforms.OSX_UNIVERSAL) {
          // these have been removed, so expect undefined
          expect(target).toBeUndefined();
        } else {
          expect(target.filename).toBe(filename);
        }
      });
    });

    // test that we resolve to universal assets when preferUniversal is true and the extension is specified
    fileNameByPlatformAndExtUniversalTests.forEach(
      ([platform, ext, filename]) => {
        it(`resolves ${platform}, ${ext} to ${filename}`, () => {
          const target = resolveReleaseAssetForVersion(
            release,
            platform,
            true,
            ext
          );
          expect(target.filename).toBe(filename);
        });
      }
    );

    // test that we fall back to conventional assets when universal are not available and the extension is specified
    fileNameByPlatformAndExtTests.forEach(([platform, ext, filename]) => {
      it(`resolves ${platform}, ${ext} to ${filename}`, () => {
        const target = resolveReleaseAssetForVersion(
          releaseWithoutUniversal,
          platform,
          true,
          ext
        );
        if (platform === platforms.OSX_UNIVERSAL) {
          // these have been removed, so expect undefined
          expect(target).toBeUndefined();
        } else {
          expect(target.filename).toBe(filename);
        }
      });
    });
  });

  describe("platformToType", () => {
    it("should extract OS from platform strings", () => {
      expect(platformToType("linux")).toBe("linux");
      expect(platformToType("linux_64")).toBe("linux");
      expect(platformToType("linux_deb_32")).toBe("linux");
      expect(platformToType("osx")).toBe("osx");
      expect(platformToType("osx_64")).toBe("osx");
      expect(platformToType("osx_arm64")).toBe("osx");
      expect(platformToType("windows")).toBe("windows");
      expect(platformToType("windows_32")).toBe("windows");
    });

    it("should throw error for invalid platform strings", () => {
      expect(() => platformToType("invalid_64" as Platform)).toThrow(
        "Unrecognized OS in platform string"
      );
      expect(() => platformToType("unknown" as Platform)).toThrow(
        "Unrecognized OS in platform string"
      );
    });
  });

  describe("mapLegacyPlatform", () => {
    it("should map legacy OSX platform names", () => {
      expect(mapLegacyPlatform("osx")).toBe(platforms.OSX_64);
      expect(mapLegacyPlatform("osx-x64")).toBe(platforms.OSX_64);
      expect(mapLegacyPlatform("osx-amd64")).toBe(platforms.OSX_64);
      expect(mapLegacyPlatform("osx-arm64")).toBe(platforms.OSX_ARM64);
      expect(mapLegacyPlatform("darwin")).toBe(platforms.OSX_64);
      expect(mapLegacyPlatform("darwin-x64")).toBe(platforms.OSX_64);
      expect(mapLegacyPlatform("darwin-amd64")).toBe(platforms.OSX_64);
      expect(mapLegacyPlatform("darwin-arm64")).toBe(platforms.OSX_ARM64);
      expect(mapLegacyPlatform("mac")).toBe(platforms.OSX_64);
      expect(mapLegacyPlatform("mac-amd64")).toBe(platforms.OSX_64);
      expect(mapLegacyPlatform("mac-x64")).toBe(platforms.OSX_64);
      expect(mapLegacyPlatform("mac-arm64")).toBe(platforms.OSX_ARM64);
    });

    it("should map legacy Windows platform names", () => {
      expect(mapLegacyPlatform("win")).toBe(platforms.WINDOWS_64);
      expect(mapLegacyPlatform("win-32")).toBe(platforms.WINDOWS_32);
      expect(mapLegacyPlatform("win-i386")).toBe(platforms.WINDOWS_32);
      expect(mapLegacyPlatform("win-ia32")).toBe(platforms.WINDOWS_32);
      expect(mapLegacyPlatform("win-x64")).toBe(platforms.WINDOWS_64);
      expect(mapLegacyPlatform("win-amd64")).toBe(platforms.WINDOWS_64);
      expect(mapLegacyPlatform("win32")).toBe(platforms.WINDOWS_32);
      expect(mapLegacyPlatform("win32-x64")).toBe(platforms.WINDOWS_64);
      expect(mapLegacyPlatform("win32-amd64")).toBe(platforms.WINDOWS_64);
    });

    it("should return original string for unmapped platforms", () => {
      expect(mapLegacyPlatform("unknown-platform")).toBe("unknown-platform");
      expect(mapLegacyPlatform("linux")).toBe("linux");
      expect(mapLegacyPlatform("")).toBe("");
    });
  });

  describe("isPlatform", () => {
    it("should return true for valid platform strings", () => {
      expect(isPlatform("linux")).toBe(true);
      expect(isPlatform("linux_64")).toBe(true);
      expect(isPlatform("linux_deb_32")).toBe(true);
      expect(isPlatform("osx")).toBe(true);
      expect(isPlatform("osx_universal")).toBe(true);
      expect(isPlatform("windows_32")).toBe(true);
    });

    it("should return false for invalid platform strings", () => {
      expect(isPlatform("invalid")).toBe(false);
      expect(isPlatform("android")).toBe(false);
      expect(isPlatform("")).toBe(false);
      expect(isPlatform("LINUX")).toBe(false); // case sensitive
    });

    it("should return false for non-string values", () => {
      expect(isPlatform(null)).toBe(false);
      expect(isPlatform(undefined)).toBe(false);
      expect(isPlatform(123)).toBe(false);
      expect(isPlatform({})).toBe(false);
      expect(isPlatform([])).toBe(false);
      expect(isPlatform(true)).toBe(false);
    });
  });
});
