import { describe, expect, it } from "vitest";
import { versionFromFilename } from "../../src/utils/versionFromFilename.js";

describe("versionFromFilename", () => {
  it.each([
    ["app-2.9.0-full.nupkg", "2.9.0"],
    ["app-2.9.0-x64-full.nupkg", "2.9.0"],
    ["app-2.8.0-beta.2-x64-delta.nupkg", "2.8.0-beta.2"],
    // any channel name, not just the four the old build-number table knew
    ["app-2.9.0-next.3-x64-full.nupkg", "2.9.0-next.3"],
    ["app-2.9.0-canary.1-arm64-full.nupkg", "2.9.0-canary.1"],
    // an app id may itself hold dashes and digits
    ["my-app-2-2.9.0-next.3-x64-full.nupkg", "2.9.0-next.3"],
    // 1.32.0 is a version, not a 32-bit marker
    ["MyApp-1.32.0-x64-full.nupkg", "1.32.0"],
    ["app-2.7.0-univ.dmg", "2.7.0"],
    // a bare version keeps its last segment: ".0" is not a file extension
    ["app-2.9.0", "2.9.0"],
  ])("reads %s as %s", (filename, version) => {
    expect(versionFromFilename(filename)).toBe(version);
  });

  it.each(["RELEASES", "app-latest-full.nupkg", "app-2.9-x64.exe"])(
    "returns undefined for %s",
    (filename) => {
      expect(versionFromFilename(filename)).toBeUndefined();
    },
  );

  // a prerelease outside the supported shapes is not a stable release: the
  // "2.9.0" sitting inside "2.9.0-rc1" must not be reported as the version
  it.each([
    "app-2.9.0-rc1-full.nupkg",
    "app-2.9.0-rc1-x64-full.nupkg",
    "app-2.9.0-beta-full.nupkg",
    "app-2.9.0-1-full.nupkg",
    // merely ending in an arch marker does not make the suffix one
    "app-2.9.0-rc.1.x64-full.nupkg",
  ])(
    "declines %s rather than truncating it to a stable version",
    (filename) => {
      expect(versionFromFilename(filename)).toBeUndefined();
    },
  );
});
