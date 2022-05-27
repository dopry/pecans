import should from "should";
import { PecansReleaseDTO } from "../../src/models";
import { filenameToOperatingSystem } from "../../src/utils/OperatingSystem";
import {
  Architecture,
  filenameToPlatform,
  OperatingSystem,
  PackageFormat,
  Platform,
  platforms,
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
        filenameToOperatingSystem(filename).should.be.exactly(os);
      });
    });
  });

  describe("filenameToArchitecture", () => {
    tests.forEach(([filename, os, arch, pkg]) => {
      it(`resolves ${filename} to architecture ${arch}`, () => {
        const os = filenameToOperatingSystem(filename);
        if (arch === null) {
          // expect an error
          should.throws(() => {
            filenameToArchitecture(filename, os);
          });
        } else {
          filenameToArchitecture(filename, os).should.be.exactly(arch);
        }
      });
    });
  });

  describe("filenameToPackageFormat", () => {
    tests.forEach(([filename, os, arch, pkg]) => {
      it(`resolves ${filename} to pkg format ${pkg}`, () => {
        const target = filenameToPackageFormat(filename);
        should(target).be.exactly(pkg);
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
          should(target).be.exactly(platform);
        }
      });
    });
  });

  describe("resolveReleaseAssetForVersion", function () {
    fileNameByPlatformTests.forEach(([platform, filename]) => {
      it(`resolves ${platform} to ${filename}`, () => {
        const target = resolveReleaseAssetForVersion(release, platform, false);
        should(target.filename).be.exactly(filename);
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
        should(target.filename).be.exactly(filename);
      });
    });
  });

  describe("resolveReleaseAssetForVersion with preferUniversal", function () {
    // test that we resolve to universal assets when preferUniversal is true
    fileNameByPlatformUniversalTests.forEach(([platform, filename]) => {
      it(`resolves ${platform} to ${filename}`, () => {
        const target = resolveReleaseAssetForVersion(release, platform, true);
        should(target.filename).be.exactly(filename);
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
          should(target).be.undefined();
        } else {
          should(target.filename).be.exactly(filename);
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
          should(target.filename).be.exactly(filename);
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
          should(target).be.undefined();
        } else {
          should(target.filename).be.exactly(filename);
        }
      });
    });
  });
});
