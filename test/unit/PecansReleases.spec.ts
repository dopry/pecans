import { describe, it, expect } from "vitest";
import { PecansReleases } from "../../src/models/PecansReleases.js";
import {
  PecansRelease,
  type PecansReleaseDTO,
} from "../../src/models/PecansRelease.js";
import type { PecansAssetDTO } from "../../src/models/PecansAsset.js";
import { channelFromVersion } from "../../src/utils/channelFromVersion.js";

describe("PecansReleases", () => {
  const createMockAssetDTO = (filename: string): PecansAssetDTO => ({
    content_type: "application/octet-stream",
    filename,
    id: Math.random().toString(),
    raw: { test: "data" },
    size: 1024,
    type: "osx_64",
  });

  const createMockReleaseDTO = (
    version: string,
    publishedAt: Date,
    overrides: Partial<PecansReleaseDTO> = {},
  ): PecansReleaseDTO => {
    // derive dependent fields from the version an override may replace, so
    // the fixture stays internally consistent
    const effectiveVersion = overrides.version ?? version;
    return {
      assets: [createMockAssetDTO(`${effectiveVersion}-app.dmg`)],
      channel: channelFromVersion(effectiveVersion),
      notes: `Release notes for ${effectiveVersion}`,
      published_at: publishedAt,
      version: effectiveVersion,
      ...overrides,
    };
  };

  describe("constructor", () => {
    it("should create instance with sorted releases", () => {
      const releases = [
        new PecansRelease(
          createMockReleaseDTO("1.0.0", new Date("2023-01-01")),
        ),
        new PecansRelease(
          createMockReleaseDTO("2.0.0", new Date("2023-02-01")),
        ),
        new PecansRelease(
          createMockReleaseDTO("1.5.0", new Date("2023-01-15")),
        ),
      ];

      const pecansReleases = new PecansReleases(releases);

      // Should be sorted by semver descending (2.0.0, 1.5.0, 1.0.0)
      const sortedReleases = pecansReleases.getReleases();
      expect(sortedReleases[0].version).toBe("2.0.0");
      expect(sortedReleases[1].version).toBe("1.5.0");
      expect(sortedReleases[2].version).toBe("1.0.0");
    });

    it("should group releases by channel", () => {
      const releases = [
        new PecansRelease(
          createMockReleaseDTO("1.0.0", new Date("2023-01-01")),
        ), // stable
        new PecansRelease(
          createMockReleaseDTO("1.1.0-beta.1", new Date("2023-01-10")),
        ), // beta
        new PecansRelease(
          createMockReleaseDTO("1.0.1", new Date("2023-01-05")),
        ), // stable
        new PecansRelease(
          createMockReleaseDTO("1.1.0-alpha.1", new Date("2023-01-08")),
        ), // alpha
      ];

      const pecansReleases = new PecansReleases(releases);

      expect(pecansReleases.getChannelNames()).toContain("stable");
      expect(pecansReleases.getChannelNames()).toContain("beta");
      expect(pecansReleases.getChannelNames()).toContain("alpha");

      const stableChannel = pecansReleases.getChannel("stable");
      expect(stableChannel?.releases).toHaveLength(2);
      expect(stableChannel?.name).toBe("stable");
    });

    it("should create channel metadata correctly", () => {
      const releases = [
        new PecansRelease(
          createMockReleaseDTO("1.0.0", new Date("2023-01-01")),
        ),
        new PecansRelease(
          createMockReleaseDTO("1.0.1", new Date("2023-01-05")),
        ),
        new PecansRelease(
          createMockReleaseDTO("1.1.0", new Date("2023-01-10")),
        ),
      ];

      const pecansReleases = new PecansReleases(releases);
      const stableChannel = pecansReleases.getChannel("stable");

      expect(stableChannel).toBeDefined();
      expect(stableChannel!.name).toBe("stable");
      expect(stableChannel!.versions_count).toBe(3);
      expect(stableChannel!.latest).toBe("1.1.0"); // Highest semver version
      expect(stableChannel!.latest_release.version).toBe("1.1.0");
      expect(stableChannel!.published_at).toEqual(new Date("2023-01-10")); // Latest published date
    });

    it("should handle mixed channels with different published dates", () => {
      const releases = [
        new PecansRelease(
          createMockReleaseDTO("1.0.0", new Date("2023-01-01")),
        ), // stable
        new PecansRelease(
          createMockReleaseDTO("2.0.0-beta.1", new Date("2023-02-01")),
        ), // beta, newer date
        new PecansRelease(
          createMockReleaseDTO("1.5.0", new Date("2023-01-15")),
        ), // stable
      ];

      const pecansReleases = new PecansReleases(releases);

      const stableChannel = pecansReleases.getChannel("stable");
      const betaChannel = pecansReleases.getChannel("beta");

      // Stable channel: latest by published date should be 1.5.0
      expect(stableChannel!.latest).toBe("1.5.0");
      expect(stableChannel!.published_at).toEqual(new Date("2023-01-15"));

      // Beta channel: only one release
      expect(betaChannel!.latest).toBe("2.0.0-beta.1");
      expect(betaChannel!.published_at).toEqual(new Date("2023-02-01"));
    });

    it("should handle empty releases array", () => {
      const pecansReleases = new PecansReleases([]);

      expect(pecansReleases.getReleases()).toHaveLength(0);
      expect(pecansReleases.getChannels()).toHaveLength(0);
      expect(pecansReleases.getChannelNames()).toHaveLength(0);
    });
  });

  describe("getChannelNames", () => {
    it("should return all unique channel names", () => {
      const releases = [
        new PecansRelease(
          createMockReleaseDTO("1.0.0", new Date("2023-01-01")),
        ), // stable
        new PecansRelease(
          createMockReleaseDTO("1.1.0-beta.1", new Date("2023-01-10")),
        ), // beta
        new PecansRelease(
          createMockReleaseDTO("1.0.1", new Date("2023-01-05")),
        ), // stable
      ];

      const pecansReleases = new PecansReleases(releases);
      const channelNames = pecansReleases.getChannelNames();

      expect(channelNames).toContain("stable");
      expect(channelNames).toContain("beta");
      expect(channelNames).toHaveLength(2);
    });

    it("should return empty array for no releases", () => {
      const pecansReleases = new PecansReleases([]);
      expect(pecansReleases.getChannelNames()).toHaveLength(0);
    });
  });

  describe("getChannel", () => {
    const releases = [
      new PecansRelease(createMockReleaseDTO("1.0.0", new Date("2023-01-01"))),
      new PecansRelease(
        createMockReleaseDTO("1.1.0-beta.1", new Date("2023-01-10")),
      ),
    ];
    const pecansReleases = new PecansReleases(releases);

    it("should return channel by name", () => {
      const stableChannel = pecansReleases.getChannel("stable");
      expect(stableChannel).toBeDefined();
      expect(stableChannel!.name).toBe("stable");
    });

    it("should return undefined for non-existent channel", () => {
      const alphaChannel = pecansReleases.getChannel("alpha");
      expect(alphaChannel).toBeUndefined();
    });
  });

  describe("getChannels", () => {
    it("should return all channels", () => {
      const releases = [
        new PecansRelease(
          createMockReleaseDTO("1.0.0", new Date("2023-01-01")),
        ),
        new PecansRelease(
          createMockReleaseDTO("1.1.0-beta.1", new Date("2023-01-10")),
        ),
      ];

      const pecansReleases = new PecansReleases(releases);
      const channels = pecansReleases.getChannels();

      expect(channels).toHaveLength(2);
      expect(channels.some((ch) => ch.name === "stable")).toBe(true);
      expect(channels.some((ch) => ch.name === "beta")).toBe(true);
    });

    it("should return empty array for no releases", () => {
      const pecansReleases = new PecansReleases([]);
      expect(pecansReleases.getChannels()).toHaveLength(0);
    });
  });

  describe("getReleases", () => {
    it("should return all releases in sorted order", () => {
      const releases = [
        new PecansRelease(
          createMockReleaseDTO("1.0.0", new Date("2023-01-01")),
        ),
        new PecansRelease(
          createMockReleaseDTO("2.0.0", new Date("2023-02-01")),
        ),
        new PecansRelease(
          createMockReleaseDTO("1.5.0", new Date("2023-01-15")),
        ),
      ];

      const pecansReleases = new PecansReleases(releases);
      const sortedReleases = pecansReleases.getReleases();

      expect(sortedReleases).toHaveLength(3);
      expect(sortedReleases[0].version).toBe("2.0.0");
      expect(sortedReleases[1].version).toBe("1.5.0");
      expect(sortedReleases[2].version).toBe("1.0.0");
    });
  });

  describe("queryReleases", () => {
    const releases = [
      new PecansRelease(createMockReleaseDTO("1.0.0", new Date("2023-01-01"))),
      new PecansRelease(
        createMockReleaseDTO("1.1.0-beta.1", new Date("2023-01-10")),
      ),
      new PecansRelease(createMockReleaseDTO("2.0.0", new Date("2023-02-01"))),
    ];
    const pecansReleases = new PecansReleases(releases);

    it("should return all releases for empty query", () => {
      const results = pecansReleases.queryReleases({});
      expect(results).toHaveLength(3);
    });

    it("should filter by channel", () => {
      const results = pecansReleases.queryReleases({ channel: "stable" });
      expect(results).toHaveLength(2); // 1.0.0 and 2.0.0
      expect(results.every((r) => r.channel === "stable")).toBe(true);
    });

    it("should filter by version range", () => {
      const results = pecansReleases.queryReleases({ version: "^1.0.0" });
      expect(results).toHaveLength(1); // Only 1.0.0 matches
      expect(results[0].version).toBe("1.0.0");
    });

    it("should combine multiple query conditions", () => {
      const results = pecansReleases.queryReleases({
        channel: "stable",
        version: ">=1.5.0",
      });
      expect(results).toHaveLength(1); // Only 2.0.0 matches
      expect(results[0].version).toBe("2.0.0");
    });

    it("should return empty array when no releases match", () => {
      const results = pecansReleases.queryReleases({ channel: "nonexistent" });
      expect(results).toHaveLength(0);
    });
  });

  describe("edge cases and complex scenarios", () => {
    it("should handle duplicate versions in same channel", () => {
      const releases = [
        new PecansRelease(
          createMockReleaseDTO("1.0.0", new Date("2023-01-01")),
        ),
        new PecansRelease(
          createMockReleaseDTO("1.0.0", new Date("2023-01-02")),
        ), // Same version, different date
      ];

      const pecansReleases = new PecansReleases(releases);
      const stableChannel = pecansReleases.getChannel("stable");

      expect(stableChannel!.versions_count).toBe(2);
      expect(stableChannel!.latest).toBe("1.0.0");
      // Should pick the later published date
      expect(stableChannel!.published_at).toEqual(new Date("2023-01-02"));
    });

    it("should handle prerelease versions correctly", () => {
      const releases = [
        new PecansRelease(
          createMockReleaseDTO("1.0.0-alpha.1", new Date("2023-01-01")),
        ),
        new PecansRelease(
          createMockReleaseDTO("1.0.0-beta.1", new Date("2023-01-05")),
        ),
        new PecansRelease(
          createMockReleaseDTO("1.0.0-rc.1", new Date("2023-01-10")),
        ),
      ];

      const pecansReleases = new PecansReleases(releases);

      expect(pecansReleases.getChannelNames()).toContain("alpha");
      expect(pecansReleases.getChannelNames()).toContain("beta");
      expect(pecansReleases.getChannelNames()).toContain("rc");
    });
  });
});
