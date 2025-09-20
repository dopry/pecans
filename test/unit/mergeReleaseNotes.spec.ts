import { describe, it, expect } from "vitest";
import {
  mergeReleaseNotes,
  formatReleaseNote,
} from "../../src/utils/mergeReleaseNotes";
import { PecansRelease } from "../../src/models/PecansRelease";

describe("mergeReleaseNotes", () => {
  const createMockRelease = (version: string, notes?: string) => {
    return new PecansRelease({
      version,
      channel: "stable",
      published_at: new Date("2025-01-01T00:00:00Z"),
      notes: notes || `Release notes for ${version}`,
      assets: [],
    });
  };

  describe("mergeReleaseNotes", () => {
    it("should merge notes from multiple releases", () => {
      const releases = [
        createMockRelease("v1.0.0", "First release"),
        createMockRelease("v1.1.0", "Bug fixes"),
      ];

      const result = mergeReleaseNotes(releases);

      expect(result).toContain("## v1.0.0");
      expect(result).toContain("First release");
      expect(result).toContain("## v1.1.0");
      expect(result).toContain("Bug fixes");
    });

    it("should skip releases without notes", () => {
      const releases = [
        new PecansRelease({
          version: "v1.0.0",
          channel: "stable",
          published_at: new Date("2025-01-01T00:00:00Z"),
          notes: "", // Empty string is falsy
          assets: [],
        }),
        createMockRelease("v1.1.0", "Bug fixes"),
      ];

      const result = mergeReleaseNotes(releases);

      expect(result).not.toContain("## v1.0.0");
      expect(result).toContain("## v1.1.0");
      expect(result).toContain("Bug fixes");
    });

    it("should exclude version tags when includeTag is false", () => {
      const releases = [createMockRelease("v1.0.0", "First release")];

      const result = mergeReleaseNotes(releases, false);

      expect(result).not.toContain("## v1.0.0");
      expect(result).toContain("First release");
    });

    it("should return empty string for empty releases array", () => {
      const result = mergeReleaseNotes([]);
      expect(result).toBe("");
    });
  });

  describe("formatReleaseNote", () => {
    it("should format release note with version by default", () => {
      const release = createMockRelease("v1.0.0", "Test notes");

      const result = formatReleaseNote(release);

      expect(result).toBe("## v1.0.0\n\nTest notes\n");
    });

    it("should format release note without version when includeVersion is false", () => {
      const release = createMockRelease("v1.0.0", "Test notes");

      const result = formatReleaseNote(release, false);

      expect(result).toBe("Test notes\n");
    });

    it("should handle releases with empty notes", () => {
      const release = new PecansRelease({
        version: "v1.0.0",
        channel: "stable",
        published_at: new Date("2025-01-01T00:00:00Z"),
        notes: "", // Empty notes should use fallback
        assets: [],
      });

      const result = formatReleaseNote(release);

      expect(result).toBe("## v1.0.0\n\nNo notes\n");
    });

    it("should handle releases with null notes", () => {
      const release = new PecansRelease({
        version: "v1.0.0",
        channel: "stable",
        published_at: new Date("2025-01-01T00:00:00Z"),
        notes: "",
        assets: [],
      });
      // Manually set notes to undefined to test the fallback
      (release as any).notes = undefined;

      const result = formatReleaseNote(release);

      expect(result).toBe("## v1.0.0\n\nNo notes\n");
    });
  });
});
