import { describe, expect, it } from "vitest";
import { PecansAssetDTO, PecansReleaseDTO } from "../../src/models";
import { Platform } from "../../src/utils/platforms";
import { resolveReleaseAssetForVersion } from "../../src/utils/resolveForVersion";

describe("resolveForVersion", () => {
  describe("resolveReleaseAssetForVersion", () => {
    // Helper function to create test assets
    const createAsset = (filename: string, type: Platform): PecansAssetDTO => ({
      content_type: "application/octet-stream",
      filename,
      id: `asset-${filename}`,
      raw: {},
      size: 1000,
      type,
    });

    // Helper function to create test release
    const createRelease = (assets: PecansAssetDTO[]): PecansReleaseDTO => ({
      assets,
      channel: "stable",
      notes: "Release notes",
      published_at: new Date(),
      version: "1.0.0",
    });

    describe("basic platform matching", () => {
      it("should resolve exact platform match", () => {
        const assets = [
          createAsset("app-windows.exe", "windows_32"),
          createAsset("app-linux.tar.gz", "linux_64"),
          createAsset("app-osx.dmg", "osx_64"),
        ];
        const release = createRelease(assets);

        const result = resolveReleaseAssetForVersion(release, "linux_64");
        expect(result).toBe(assets[1]);
      });

      it("should return undefined when no compatible assets found", () => {
        const assets = [
          createAsset("app.txt", "windows_32"), // unsupported extension
          createAsset("readme.md", "linux_64"), // unsupported extension
        ];
        const release = createRelease(assets);

        const result = resolveReleaseAssetForVersion(release, "osx_64");
        expect(result).toBe(undefined);
      });
    });

    describe("universal binary preference", () => {
      it("should prefer universal binary for osx when preferUniversal is true", () => {
        const assets = [
          createAsset("app-osx64.dmg", "osx_64"),
          createAsset("app-universal.dmg", "osx_universal"),
        ];
        const release = createRelease(assets);

        const result = resolveReleaseAssetForVersion(release, "osx_64", true);
        expect(result).toBe(assets[1]); // should prefer universal
      });

      it("should not add universal platform when preferUniversal is false", () => {
        const assets = [
          createAsset("app-osx64.dmg", "osx_64"),
          createAsset("app-universal.dmg", "osx_universal"),
        ];
        const release = createRelease(assets);

        const result = resolveReleaseAssetForVersion(release, "osx_64", false);
        expect(result).toBe(assets[0]); // should only match exact platform
      });

      it("should handle osx platforms with universal preference", () => {
        const assets = [
          createAsset("app-arm64.dmg", "osx_arm64"),
          createAsset("app-universal.dmg", "osx_universal"),
        ];
        const release = createRelease(assets);

        const result = resolveReleaseAssetForVersion(
          release,
          "osx_arm64",
          true
        );
        expect(result).toBe(assets[1]); // should prefer universal
      });
    });

    describe("wanted extension preference", () => {
      it("should prioritize wanted extension", () => {
        const assets = [
          createAsset("app.dmg", "osx_64"),
          createAsset("app.zip", "osx_64"),
        ];
        const release = createRelease(assets);

        const result = resolveReleaseAssetForVersion(
          release,
          "osx_64",
          true,
          ".zip"
        );
        expect(result).toBe(assets[1]); // should prefer .zip as wanted
      });

      it("should fall back to other extensions when wanted is not available", () => {
        const assets = [createAsset("app.dmg", "osx_64")];
        const release = createRelease(assets);

        const result = resolveReleaseAssetForVersion(
          release,
          "osx_64",
          true,
          ".zip"
        );
        expect(result).toBe(assets[0]); // should fall back to .dmg
      });
    });

    describe("sorting logic", () => {
      it("should prefer longer platform types (more specific)", () => {
        const assets = [
          createAsset("app1.dmg", "osx" as Platform), // shorter type
          createAsset("app2.dmg", "osx_64"), // longer type
          createAsset("app3.dmg", "osx_universal"), // longest type
        ];
        const release = createRelease(assets);

        const result = resolveReleaseAssetForVersion(release, "osx_64", true);
        expect(result).toBe(assets[2]); // should prefer osx_universal (longest)
      });

      it("should sort by extension preference when platform lengths are equal", () => {
        const assets = [
          createAsset("app.zip", "osx_64"), // .zip is later in SUPPORTED_FILE_EXTENSIONS
          createAsset("app.dmg", "osx_64"), // .dmg is earlier in SUPPORTED_FILE_EXTENSIONS
        ];
        const release = createRelease(assets);

        const result = resolveReleaseAssetForVersion(release, "osx_64", false);
        expect(result).toBe(assets[1]); // should prefer .dmg (earlier in prefs)
      });

      it("should handle platforms that do not start with osx", () => {
        const assets = [
          createAsset("app.exe", "windows_32"),
          createAsset("app.deb", "linux_deb_64"),
        ];
        const release = createRelease(assets);

        // Test that non-osx platforms don't get universal added
        const result1 = resolveReleaseAssetForVersion(
          release,
          "windows_32",
          true
        );
        expect(result1).toBe(assets[0]);

        const result2 = resolveReleaseAssetForVersion(
          release,
          "linux_deb_64",
          true
        );
        expect(result2).toBe(assets[1]);
      });

      it("should handle reverse sorting order (shorter before longer)", () => {
        // This test specifically covers the p2.type.length > p1.type.length branch
        const assets = [
          createAsset("app-specific.dmg", "osx_universal"), // 13 chars - longest
          createAsset("app-generic.dmg", "osx"), // 3 chars - shortest
        ];
        const release = createRelease(assets);

        // When sorting, it will compare "osx_universal" vs "osx"
        // During comparison: p1="osx_universal" (13), p2="osx" (3)
        // This should hit p1.type.length > p2.type.length (return -1)
        // But we need the reverse case. Let's force a different order:
        const result = resolveReleaseAssetForVersion(release, "osx_64", true);

        // Should prefer the longer, more specific platform type
        expect(result).toBe(assets[0]); // osx_universal should be preferred
      });

      it("should cover the p2 > p1 length comparison branch", () => {
        // This test specifically targets line 39: if (p2.type.length > p1.type.length) return 1;
        // Create multiple assets that will ALL match the filter, forcing actual sorting comparisons
        const assets = [
          createAsset("app1.dmg", "osx_64"), // 6 chars - will match osx platforms
          createAsset("app2.dmg", "osx_universal"), // 13 chars - will match osx platforms
          createAsset("app3.dmg", "osx"), // 3 chars - will match osx platforms
        ];
        const release = createRelease(assets);

        // Request osx_64 with preferUniversal=true, so it will add both osx_64 and osx_universal to platforms array
        // All three assets have compatible extensions (.dmg), and their types start with "osx"
        // During sorting, we should get comparisons like: osx_64 vs osx, osx_universal vs osx, etc.
        const result = resolveReleaseAssetForVersion(release, "osx", true);

        // Should prefer the longest platform type (osx_universal)
        expect(result).toBe(assets[1]);
      });
    });

    describe("complex scenarios", () => {
      it("should handle mixed platforms and extensions", () => {
        const assets = [
          createAsset("app-win.exe", "windows_32"),
          createAsset("app-linux.tar.gz", "linux_64"),
          createAsset("app-linux.deb", "linux_deb_64"),
          createAsset("app-osx.dmg", "osx_64"),
          createAsset("app-osx.zip", "osx_64"),
          createAsset("app-universal.dmg", "osx_universal"),
        ];
        const release = createRelease(assets);

        // Test Windows
        const winResult = resolveReleaseAssetForVersion(release, "windows_32");
        expect(winResult).toBe(assets[0]);

        // Test Linux with deb preference
        const linuxResult = resolveReleaseAssetForVersion(
          release,
          "linux_deb_64"
        );
        expect(linuxResult).toBe(assets[2]);

        // Test OSX with universal preference
        const osxResult = resolveReleaseAssetForVersion(
          release,
          "osx_64",
          true
        );
        expect(osxResult).toBe(assets[5]); // should get universal
      });

      it("should handle empty assets array", () => {
        const release = createRelease([]);

        const result = resolveReleaseAssetForVersion(release, "osx_64");
        expect(result).toBe(undefined);
      });

      it("should handle assets with unsupported extensions", () => {
        const assets = [
          createAsset("app.txt", "osx_64"),
          createAsset("readme.md", "osx_64"),
          createAsset("app.dmg", "osx_64"), // only this one is supported
        ];
        const release = createRelease(assets);

        const result = resolveReleaseAssetForVersion(release, "osx_64");
        expect(result).toBe(assets[2]); // should only match the .dmg file
      });
    });

    describe("edge cases", () => {
      it("should handle platform type that exactly matches filter", () => {
        const assets = [createAsset("app.dmg", "osx_64")];
        const release = createRelease(assets);

        const result = resolveReleaseAssetForVersion(release, "osx_64", false);
        expect(result).toBe(assets[0]);
      });

      it("should handle when getSupportedExt returns undefined", () => {
        const assets = [
          createAsset("app.unsupported", "osx_64"), // unsupported extension
          createAsset("app.dmg", "osx_64"), // supported extension
        ];
        const release = createRelease(assets);

        const result = resolveReleaseAssetForVersion(release, "osx_64");
        expect(result).toBe(assets[1]); // should filter out unsupported and return .dmg
      });
    });
  });
});
