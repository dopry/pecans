import { describe, expect, it } from "vitest";
import { versionFromTag } from "../../src/utils/versionFromTag.js";

describe("versionFromTag", () => {
  it("returns the version for semver tags, with or without a leading v", () => {
    expect(versionFromTag("1.2.3")).toBe("1.2.3");
    expect(versionFromTag("v1.2.3")).toBe("1.2.3");
    expect(versionFromTag("v2.0.0-beta.3")).toBe("2.0.0-beta.3");
  });

  it("drops build metadata", () => {
    expect(versionFromTag("v1.2.3+build.7")).toBe("1.2.3");
  });

  it("returns undefined for tags that are not versions", () => {
    for (const tag of [
      "nightly",
      "latest",
      "docs-1",
      "release-1.0.0-beta",
      "1.0",
    ]) {
      expect(versionFromTag(tag)).toBeUndefined();
    }
  });
});
