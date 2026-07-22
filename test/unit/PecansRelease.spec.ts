import { describe, it, expect, vi } from "vitest";
import {
  PecansRelease,
  type PecansReleaseDTO,
  isPecansAsset,
} from "../../src/models/PecansRelease.js";
import {
  PecansAsset,
  type PecansAssetDTO,
} from "../../src/models/PecansAsset.js";
import type { PecansReleaseQuery } from "../../src/models/PecansReleaseQuery.js";

describe("PecansRelease", () => {
  const createMockAssetDTO = (
    overrides: Partial<PecansAssetDTO> = {},
  ): PecansAssetDTO => ({
    content_type: "application/octet-stream",
    filename: "test-app-osx.dmg",
    id: "123",
    raw: { test: "data" },
    size: 1024,
    type: "osx_64",
    ...overrides,
  });

  const createMockReleaseDTO = (
    overrides: Partial<PecansReleaseDTO> = {},
  ): PecansReleaseDTO => {
    const version = overrides.version ?? "1.0.0";
    return {
      assets: [createMockAssetDTO()],
      notes: "Release notes",
      published_at: new Date("2023-01-01"),
      version,
      ...overrides,
    };
  };

  describe("constructor", () => {
    it("should create instance with all properties from DTO", () => {
      const dto = createMockReleaseDTO();
      const release = new PecansRelease(dto);

      expect(release.assets).toHaveLength(1);
      expect(release.assets[0]).toBeInstanceOf(PecansAsset);
      expect(release.notes).toBe(dto.notes);
      expect(release.published_at).toBe(dto.published_at);
      expect(release.version).toBe(dto.version);
    });

    it("should derive channel from version using channelFromVersion", () => {
      const release = new PecansRelease(
        createMockReleaseDTO({
          version: "1.0.0-beta.1",
        }),
      );
      expect(release.channel).toBe("beta");
    });

    it("derives the stable channel for release versions", () => {
      // no prerelease identifier means the stable channel; numeric-only
      // prerelease ids (1.0.0-2) also fall back to stable
      expect(new PecansRelease(createMockReleaseDTO()).channel).toBe("stable");
      expect(
        new PecansRelease(createMockReleaseDTO({ version: "1.0.0-2" })).channel,
      ).toBe("stable");
    });

    it("should filter out assets that fail to parse", () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const dto = createMockReleaseDTO({
        assets: [
          createMockAssetDTO({ filename: "valid-app.dmg" }),
          // This will cause an error in PecansAsset constructor due to unrecognizable filename
          createMockAssetDTO({ filename: "unrecognizable-format" }),
          createMockAssetDTO({ filename: "another-valid-app.dmg" }),
        ],
      });

      const release = new PecansRelease(dto);

      // Should only have the valid assets, filtering out the problematic one
      expect(release.assets).toHaveLength(2);
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("should handle empty assets array", () => {
      const release = new PecansRelease(
        createMockReleaseDTO({
          assets: [],
        }),
      );
      expect(release.assets).toHaveLength(0);
    });
  });

  describe("satisfiesQuery", () => {
    const release = new PecansRelease(
      createMockReleaseDTO({
        version: "1.2.0", // Use stable version that will properly match semver ranges
        assets: [
          createMockAssetDTO({ filename: "app-osx.dmg" }),
          createMockAssetDTO({ filename: "app-linux.deb" }),
        ],
      }),
    );

    it("should return true when all query conditions are satisfied", () => {
      const query: PecansReleaseQuery = {
        channel: "stable", // Stable version will have "stable" channel
        version: ">=1.0.0",
        os: "osx",
      };
      expect(release.satisfiesQuery(query)).toBe(true);
    });

    it("should return false when channel does not match", () => {
      const query: PecansReleaseQuery = {
        channel: "beta", // Release is stable (1.2.0)
      };
      expect(release.satisfiesQuery(query)).toBe(false);
    });

    it("should return false when version range does not match", () => {
      const query: PecansReleaseQuery = {
        version: "^2.0.0", // Release is 1.2.0
      };
      expect(release.satisfiesQuery(query)).toBe(false);
    });

    it("should return false when no assets match the query", () => {
      const query: PecansReleaseQuery = {
        os: "windows", // Release has only osx and linux assets
      };
      expect(release.satisfiesQuery(query)).toBe(false);
    });

    it("should return true for empty query", () => {
      expect(release.satisfiesQuery({})).toBe(true);
    });
  });

  describe("queryAssets", () => {
    const release = new PecansRelease(
      createMockReleaseDTO({
        assets: [
          createMockAssetDTO({ filename: "app-osx.dmg" }),
          createMockAssetDTO({ filename: "app-linux.deb" }),
          createMockAssetDTO({ filename: "app-windows.exe" }),
        ],
      }),
    );

    it("should return all assets for empty query", () => {
      const results = release.queryAssets({});
      expect(results).toHaveLength(3);
    });

    it("should filter assets by OS", () => {
      const results = release.queryAssets({ os: "linux" });
      expect(results).toHaveLength(1);
      expect(results[0].filename).toBe("app-linux.deb");
    });

    it("should return empty array when no assets match", () => {
      const results = release.queryAssets({ arch: "arm64" });
      expect(results).toHaveLength(0);
    });
  });

  describe("satisfiesChannel", () => {
    const release = new PecansRelease(
      createMockReleaseDTO({
        version: "1.0.0-beta.1", // Channel will be "beta"
      }),
    );

    it("should return true when channel is undefined", () => {
      expect(release.satisfiesChannel(undefined)).toBe(true);
    });

    it("should return true when channel is wildcard '*'", () => {
      expect(release.satisfiesChannel("*")).toBe(true);
    });

    it("should return true when channel matches exactly", () => {
      expect(release.satisfiesChannel("beta")).toBe(true);
    });

    it("should return false when channel does not match", () => {
      expect(release.satisfiesChannel("stable")).toBe(false);
    });
  });

  describe("satisfiesSemVerRange", () => {
    const release = new PecansRelease(
      createMockReleaseDTO({
        version: "1.2.3",
      }),
    );

    it("should return true when range is undefined", () => {
      expect(release.satisfiesSemVerRange(undefined)).toBe(true);
    });

    it("should return true when range is 'latest'", () => {
      expect(release.satisfiesSemVerRange("latest")).toBe(true);
    });

    it("should return true for valid range that matches version", () => {
      expect(release.satisfiesSemVerRange("^1.0.0")).toBe(true);
      expect(release.satisfiesSemVerRange("~1.2.0")).toBe(true);
      expect(release.satisfiesSemVerRange(">=1.2.3")).toBe(true);
    });

    it("should return false for valid range that does not match version", () => {
      expect(release.satisfiesSemVerRange("^2.0.0")).toBe(false);
      expect(release.satisfiesSemVerRange("~1.1.0")).toBe(false);
      expect(release.satisfiesSemVerRange("<1.2.3")).toBe(false);
    });

    it("should throw error for invalid range", () => {
      expect(() => release.satisfiesSemVerRange("invalid-range")).toThrow(
        "Invalid Range Specified",
      );
    });
  });

  describe("edge cases", () => {
    it("should handle prerelease versions", () => {
      const release = new PecansRelease(
        createMockReleaseDTO({
          version: "1.0.0-alpha.1",
        }),
      );
      expect(release.channel).toBe("alpha");
      expect(release.satisfiesSemVerRange(">=1.0.0-alpha")).toBe(true);
    });

    it("should handle stable versions", () => {
      const release = new PecansRelease(
        createMockReleaseDTO({
          version: "1.0.0",
        }),
      );
      expect(release.channel).toBe("stable");
    });

    it("should handle complex semver ranges", () => {
      const release = new PecansRelease(
        createMockReleaseDTO({
          version: "2.1.5",
        }),
      );
      expect(release.satisfiesSemVerRange(">=2.0.0 <3.0.0")).toBe(true);
      expect(
        release.satisfiesSemVerRange("1.x || >=2.5.0 || 5.0.0 - 7.2.3"),
      ).toBe(false);
    });
  });
});

describe("isPecansAsset", () => {
  it("should return true for PecansAsset instance", () => {
    const assetDTO = {
      content_type: "application/octet-stream",
      filename: "test.dmg",
      id: "123",
      raw: {},
      size: 1024,
      type: "osx_64" as const,
    };
    const asset = new PecansAsset(assetDTO);
    expect(isPecansAsset(asset)).toBe(true);
  });

  it("should return false for non-PecansAsset objects", () => {
    expect(isPecansAsset({})).toBe(false);
    expect(isPecansAsset(null)).toBe(false);
    expect(isPecansAsset(undefined)).toBe(false);
    expect(isPecansAsset("string")).toBe(false);
    expect(isPecansAsset(123)).toBe(false);
    expect(isPecansAsset([])).toBe(false);
  });
});
