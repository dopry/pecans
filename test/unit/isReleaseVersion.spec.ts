import { describe, expect, it } from "vitest";
import { isReleaseVersion } from "../../src/utils/isReleaseVersion.js";

describe("isReleaseVersion", () => {
  it("accepts releases and semantic-release style prereleases", () => {
    for (const v of [
      "2.7.0",
      "2.8.0-beta.1",
      "2.0.0-next.18",
      "1.0.0-beta.rc.1",
    ]) {
      expect(isReleaseVersion(v)).toBe(true);
    }
  });

  it("rejects everything else", () => {
    for (const v of [
      "nightly",
      "1.0",
      "2.9.0-1",
      "2.0.0-beta",
      "2.0.0-rc1",
      "2.0.0-beta.x",
    ]) {
      expect(isReleaseVersion(v)).toBe(false);
    }
  });
});
