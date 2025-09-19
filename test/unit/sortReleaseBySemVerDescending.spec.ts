import { describe, it, expect } from "vitest";
import { sortReleaseBySemVerDescending } from "../../src/utils/sortReleaseBySemVerDescending.js";
import { PecansRelease } from "../../src/models/PecansRelease.js";

describe("sortReleaseBySemVerDescending", () => {
  // Helper function to create test releases
  const createRelease = (version: string): PecansRelease => {
    return new PecansRelease({
      version,
      assets: [],
      channel: "stable",
      notes: "Test release",
      published_at: new Date("2023-01-01"),
    });
  };

  it("should return -1 when first version is greater than second (descending order)", () => {
    const releaseA = createRelease("2.0.0");
    const releaseB = createRelease("1.0.0");

    expect(sortReleaseBySemVerDescending(releaseA, releaseB)).toBe(-1);
  });

  it("should return 1 when first version is less than second (descending order)", () => {
    const releaseA = createRelease("1.0.0");
    const releaseB = createRelease("2.0.0");

    expect(sortReleaseBySemVerDescending(releaseA, releaseB)).toBe(1);
  });

  it("should return 0 when versions are equal", () => {
    const releaseA = createRelease("1.0.0");
    const releaseB = createRelease("1.0.0");

    expect(sortReleaseBySemVerDescending(releaseA, releaseB)).toBe(0);
  });

  it("should correctly sort patch versions", () => {
    const releaseA = createRelease("1.0.2");
    const releaseB = createRelease("1.0.1");

    expect(sortReleaseBySemVerDescending(releaseA, releaseB)).toBe(-1);
  });

  it("should correctly sort minor versions", () => {
    const releaseA = createRelease("1.2.0");
    const releaseB = createRelease("1.1.0");

    expect(sortReleaseBySemVerDescending(releaseA, releaseB)).toBe(-1);
  });

  it("should correctly sort prerelease versions", () => {
    const releaseA = createRelease("2.0.0-alpha.1");
    const releaseB = createRelease("1.0.0");

    expect(sortReleaseBySemVerDescending(releaseA, releaseB)).toBe(-1);
  });

  it("should correctly sort prerelease vs release versions of same base", () => {
    const releaseA = createRelease("2.0.0");
    const releaseB = createRelease("2.0.0-alpha.1");

    expect(sortReleaseBySemVerDescending(releaseA, releaseB)).toBe(-1);
  });

  it("should correctly sort different prerelease versions", () => {
    const releaseA = createRelease("2.0.0-beta.1");
    const releaseB = createRelease("2.0.0-alpha.1");

    expect(sortReleaseBySemVerDescending(releaseA, releaseB)).toBe(-1);
  });

  it("should work with Array.sort for descending order", () => {
    const releases = [
      createRelease("1.0.0"),
      createRelease("3.0.0"),
      createRelease("2.0.0"),
      createRelease("1.1.0"),
      createRelease("2.0.0-alpha.1"),
    ];

    const sorted = releases.sort(sortReleaseBySemVerDescending);
    const versions = sorted.map((r) => r.version);

    expect(versions).toEqual([
      "3.0.0",
      "2.0.0",
      "2.0.0-alpha.1",
      "1.1.0",
      "1.0.0",
    ]);
  });

  it("should handle complex version numbers", () => {
    const releaseA = createRelease("10.2.1");
    const releaseB = createRelease("9.15.3");

    expect(sortReleaseBySemVerDescending(releaseA, releaseB)).toBe(-1);
  });

  it("should handle build metadata (should be ignored in comparison)", () => {
    const releaseA = createRelease("1.0.0+build.1");
    const releaseB = createRelease("1.0.0+build.2");

    expect(sortReleaseBySemVerDescending(releaseA, releaseB)).toBe(0);
  });

  it("should handle rc and beta prereleases correctly", () => {
    const releaseA = createRelease("2.0.0-rc.1");
    const releaseB = createRelease("2.0.0-beta.1");

    expect(sortReleaseBySemVerDescending(releaseA, releaseB)).toBe(-1);
  });
});
