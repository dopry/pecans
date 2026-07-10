import { describe, it, expect } from "vitest";
import { channelFromVersion } from "../../src/utils/channelFromVersion.js";

describe("channelFromVersion", () => {
  it("should return 'stable' for versions without prerelease components", () => {
    expect(channelFromVersion("1.0.0")).toBe("stable");
    expect(channelFromVersion("2.1.3")).toBe("stable");
    expect(channelFromVersion("10.0.0")).toBe("stable");
  });

  it("should return channel name for versions with string prerelease identifiers", () => {
    expect(channelFromVersion("1.0.0-beta")).toBe("beta");
    expect(channelFromVersion("1.0.0-alpha.1")).toBe("alpha");
    expect(channelFromVersion("2.1.0-rc.2")).toBe("rc");
    expect(channelFromVersion("1.0.0-nightly.20230101")).toBe("nightly");
  });

  it("should handle typical prerelease formats", () => {
    expect(channelFromVersion("1.0.0-next.1")).toBe("next");
    expect(channelFromVersion("1.0.0-beta.2")).toBe("beta");
    expect(channelFromVersion("2.1.0-alpha.3")).toBe("alpha");
    expect(channelFromVersion("1.0.0-rc.1")).toBe("rc");
    expect(channelFromVersion("3.2.1-canary.5")).toBe("canary");
  });

  it("should return 'stable' when prerelease component is not a string", () => {
    // This targets the uncovered branch: typeof channel == "string" ? channel : "stable"
    // When semver.prerelease returns an array with numeric first element (not string)
    // semver.prerelease("1.0.0-1") returns [1] (number), not ["1"] (string)
    expect(channelFromVersion("1.0.0-1")).toBe("stable"); // Numeric prerelease -> stable
    expect(channelFromVersion("1.0.0-0")).toBe("stable"); // Numeric 0 -> stable
    expect(channelFromVersion("2.1.0-42")).toBe("stable"); // Any numeric prerelease -> stable
  });

  it("should handle various prerelease formats", () => {
    expect(channelFromVersion("1.0.0-beta.1")).toBe("beta");
    expect(channelFromVersion("1.0.0-alpha.2.3")).toBe("alpha");
    expect(channelFromVersion("1.0.0-rc")).toBe("rc");
    expect(channelFromVersion("1.0.0-dev.snapshot")).toBe("dev");
  });

  it("should handle edge case versions", () => {
    expect(channelFromVersion("0.0.1-test")).toBe("test");
    expect(channelFromVersion("1.0.0-beta")).toBe("beta"); // String prerelease identifier
  });
});
