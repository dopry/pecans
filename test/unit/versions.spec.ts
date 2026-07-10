import { beforeEach, describe, expect, it } from "vitest";
import { Backend } from "../../src/backends/backend";
import { PecansRelease } from "../../src/models/PecansRelease";
import { PecansReleases } from "../../src/models/PecansReleases";
import { UnsupportedPlatformError } from "../../src/pecans";
import { Versions } from "../../src/versions";

// Mock backend
class MockBackend extends Backend {
  private mockReleases: PecansReleases;

  constructor(releases: PecansRelease[]) {
    super();
    this.mockReleases = new PecansReleases(releases);
  }

  async fetchReleases(): Promise<PecansReleases> {
    return this.mockReleases;
  }

  async releases(): Promise<PecansReleases> {
    return this.mockReleases;
  }

  async serveAsset(): Promise<void> {
    throw new Error("Abstract Method");
  }

  async getAssetStream(): Promise<any> {
    throw new Error("Abstract Method");
  }
}

describe("Versions", () => {
  let versions: Versions;
  let mockBackend: MockBackend;

  const createMockRelease = (
    version: string,
    channel: string = "stable",
    assets: Array<{ type: string; filename: string }> = [],
  ): PecansRelease => {
    return new PecansRelease({
      version,
      channel,
      notes: `Release ${version}`,
      published_at: new Date("2023-01-01"),
      assets: assets.map((asset, index) => ({
        id: `${version}-${index}`,
        type: asset.type as any,
        filename: asset.filename,
        size: 1000,
        content_type: "application/octet-stream",
        raw: { url: `https://example.com/${asset.filename}` },
      })),
    });
  };

  describe("filterDefaults", () => {
    it("should have correct default values", () => {
      expect(Versions.filterDefaults).toEqual({
        versionRange: "latest",
        platform: undefined,
        channel: "stable",
        preferUniversal: true,
      });
    });
  });

  describe("constructor", () => {
    it("should create instance with backend", () => {
      const backend = new MockBackend([]);
      const versionsInstance = new Versions(backend);
      expect(versionsInstance).toBeInstanceOf(Versions);
    });
  });

  describe("filter", () => {
    beforeEach(() => {
      const releases = [
        createMockRelease("2.0.0", "stable", [
          { type: "osx_64", filename: "app-2.0.0-mac.dmg" },
          { type: "windows_64", filename: "app-2.0.0-win.exe" },
          { type: "linux_64", filename: "app-2.0.0-linux.tar.gz" },
        ]),
        createMockRelease("1.5.0", "stable", [
          { type: "osx_64", filename: "app-1.5.0-mac.dmg" },
          { type: "osx_universal", filename: "app-1.5.0-universal.dmg" },
        ]),
        createMockRelease("1.0.0-beta.1", "beta", [
          { type: "osx_64", filename: "app-1.0.0-beta.1-mac.dmg" },
        ]),
      ];
      mockBackend = new MockBackend(releases);
      versions = new Versions(mockBackend);
    });

    it("should apply default options when none provided", async () => {
      const result = await versions.filter({});
      expect(result).toHaveLength(1);
      expect(result[0].version).toBe("2.0.0");
    });

    it("should filter by channel", async () => {
      const result = await versions.filter({ channel: "beta" });
      expect(result).toHaveLength(1);
      expect(result[0].version).toBe("1.0.0-beta.1");
    });

    it("should filter by platform", async () => {
      const result = await versions.filter({ platform: "osx_64" });
      expect(result.length).toBeGreaterThan(0);
      result.forEach((release) => {
        expect(release.assets.some((asset) => asset.type === "osx_64")).toBe(
          true,
        );
      });
    });

    it("should throw UnsupportedPlatformError for invalid platform", async () => {
      await expect(
        versions.filter({ platform: "invalid_platform" as any }),
      ).rejects.toThrow(UnsupportedPlatformError);
    });

    it("should return empty array when no releases match platform", async () => {
      const result = await versions.filter({ platform: "linux_32" });
      expect(result).toHaveLength(0);
    });

    it("should prefer universal binary for osx platforms when preferUniversal is true", async () => {
      const result = await versions.filter({
        platform: "osx_64",
        preferUniversal: true,
        versionRange: "1.5.0",
      });
      expect(result).toHaveLength(1);
      expect(result[0].version).toBe("1.5.0");
    });

    it("should not prefer universal binary when preferUniversal is false", async () => {
      const result = await versions.filter({
        platform: "osx_64",
        preferUniversal: false,
      });
      expect(result.length).toBeGreaterThan(0);
    });

    it("should filter by semver range", async () => {
      const result = await versions.filter({ versionRange: ">=1.5.0" });
      expect(result.every((r) => r.version >= "1.5.0")).toBe(true);
    });

    it("should return only latest when multiple matches and versionRange is 'latest'", async () => {
      const result = await versions.filter({
        versionRange: "latest",
        channel: "stable",
      });
      expect(result).toHaveLength(1);
      expect(result[0].version).toBe("2.0.0");
    });

    it("should return all matches when versionRange is not 'latest'", async () => {
      const result = await versions.filter({
        versionRange: ">=1.0.0",
        channel: "stable",
      });
      expect(result.length).toBeGreaterThan(1);
    });

    it("should exclude RELEASES files from platform matching", async () => {
      const releasesWithRELEASES = [
        createMockRelease("1.0.0", "stable", [
          { type: "windows_64", filename: "RELEASES" },
          { type: "osx_64", filename: "app-1.0.0-mac.dmg" },
        ]),
      ];
      const backend = new MockBackend(releasesWithRELEASES);
      const versionsInstance = new Versions(backend);

      const result = await versionsInstance.filter({ platform: "osx_64" });
      expect(result).toHaveLength(1);
    });
  });

  describe("get", () => {
    beforeEach(() => {
      const releases = [
        createMockRelease("2.0.0", "stable", [
          { type: "osx_64", filename: "app.dmg" },
        ]),
        createMockRelease("1.0.0", "stable", [
          { type: "osx_64", filename: "app.dmg" },
        ]),
      ];
      mockBackend = new MockBackend(releases);
      versions = new Versions(mockBackend);
    });

    it("should get specific version by tag", async () => {
      const result = await versions.get("1.0.0");
      expect(result.version).toBe("1.0.0");
    });

    it("should throw error when version not found", async () => {
      await expect(versions.get("3.0.0")).rejects.toThrow("Release not found");
    });
  });

  describe("list", () => {
    beforeEach(() => {
      const releases = [
        createMockRelease("1.0.0", "stable"),
        createMockRelease("2.0.0", "stable"),
        createMockRelease("1.5.0", "stable"),
      ];
      mockBackend = new MockBackend(releases);
      versions = new Versions(mockBackend);
    });

    it("should return all releases sorted by semver descending", async () => {
      const result = await versions.list();
      expect(result).toHaveLength(3);
      expect(result[0].version).toBe("2.0.0");
      expect(result[1].version).toBe("1.5.0");
      expect(result[2].version).toBe("1.0.0");
    });
  });

  describe("resolve", () => {
    beforeEach(() => {
      const releases = [
        createMockRelease("2.0.0", "stable", [
          { type: "osx_64", filename: "app.dmg" },
        ]),
        createMockRelease("1.0.0", "stable", [
          { type: "osx_64", filename: "app.dmg" },
        ]),
      ];
      mockBackend = new MockBackend(releases);
      versions = new Versions(mockBackend);
    });

    it("should resolve and return first matching release", async () => {
      const result = await versions.resolve({ versionRange: ">=1.0.0" });
      expect(result.version).toBe("2.0.0"); // Latest first due to sorting
    });

    it("should throw error when no releases match", async () => {
      await expect(
        versions.resolve({ versionRange: ">=3.0.0" }),
      ).rejects.toThrow('Release not found: {"versionRange":">=3.0.0"}');
    });

    it("should resolve with specific platform", async () => {
      const result = await versions.resolve({ platform: "osx_64" });
      expect(result.version).toBe("2.0.0");
    });

    it("should throw error when no releases match platform", async () => {
      await expect(versions.resolve({ platform: "linux_32" })).rejects.toThrow(
        "Release not found",
      );
    });
  });

  describe("integration scenarios", () => {
    beforeEach(() => {
      const releases = [
        createMockRelease("3.0.0", "stable", [
          { type: "osx_64", filename: "app-3.0.0-mac.dmg" },
          { type: "osx_universal", filename: "app-3.0.0-universal.dmg" },
          { type: "windows_64", filename: "app-3.0.0-win.exe" },
        ]),
        createMockRelease("2.5.0", "stable", [
          { type: "osx_64", filename: "app-2.5.0-mac.dmg" },
        ]),
        createMockRelease("2.0.0-rc.1", "rc", [
          { type: "osx_64", filename: "app-2.0.0-rc.1-mac.dmg" },
        ]),
      ];
      mockBackend = new MockBackend(releases);
      versions = new Versions(mockBackend);
    });

    it("should handle complex filtering with multiple criteria", async () => {
      const result = await versions.filter({
        versionRange: ">=2.0.0",
        platform: "osx_64",
        channel: "stable",
      });
      expect(result).toHaveLength(2);
      expect(result[0].version).toBe("3.0.0");
      expect(result[1].version).toBe("2.5.0");
    });

    it("should prefer universal over specific architecture when available", async () => {
      const result = await versions.filter({
        platform: "osx_64",
        preferUniversal: true,
        versionRange: "3.0.0",
      });
      expect(result).toHaveLength(1);
      expect(
        result[0].assets.some((asset) => asset.type === "osx_universal"),
      ).toBe(true);
    });
  });
});
