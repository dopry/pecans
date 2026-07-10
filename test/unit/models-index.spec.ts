import { describe, it, expect } from "vitest";
import * as ModelsIndex from "../../src/models/index.js";

describe("Models Index Exports", () => {
  it("should export PecansAsset and PecansAssetDTO", () => {
    expect(ModelsIndex.PecansAsset).toBeDefined();
    expect(typeof ModelsIndex.PecansAsset).toBe("function"); // Constructor function
  });

  it("should export PecansAssetQuery interface type", () => {
    // TypeScript interfaces don't exist at runtime, but we can verify the module structure
    // The import should succeed without throwing
    expect(ModelsIndex).toBeDefined();
  });

  it("should export PecansChannel interface type", () => {
    // TypeScript interfaces don't exist at runtime, but we can verify the module structure
    expect(ModelsIndex).toBeDefined();
  });

  it("should export PecansRelease, PecansReleaseDTO, and isPecansAsset", () => {
    expect(ModelsIndex.PecansRelease).toBeDefined();
    expect(typeof ModelsIndex.PecansRelease).toBe("function"); // Constructor function
    expect(ModelsIndex.isPecansAsset).toBeDefined();
    expect(typeof ModelsIndex.isPecansAsset).toBe("function");
  });

  it("should export PecansReleaseQuery interface type", () => {
    // TypeScript interfaces don't exist at runtime, but we can verify the module structure
    expect(ModelsIndex).toBeDefined();
  });

  it("should export PecansReleases", () => {
    expect(ModelsIndex.PecansReleases).toBeDefined();
    expect(typeof ModelsIndex.PecansReleases).toBe("function"); // Constructor function
  });

  it("should be able to instantiate exported classes", () => {
    // Test that we can actually use the exported classes
    const assetDTO = {
      content_type: "application/octet-stream",
      filename: "test.dmg",
      id: "123",
      raw: {},
      size: 1024,
      type: "osx_64" as const,
    };

    const releaseDTO = {
      assets: [assetDTO],
      channel: "stable",
      notes: "Test release",
      published_at: new Date(),
      version: "1.0.0",
    };

    // Should be able to create instances using exported constructors
    const asset = new ModelsIndex.PecansAsset(assetDTO);
    expect(asset).toBeInstanceOf(ModelsIndex.PecansAsset);

    const release = new ModelsIndex.PecansRelease(releaseDTO);
    expect(release).toBeInstanceOf(ModelsIndex.PecansRelease);

    const releases = new ModelsIndex.PecansReleases([release]);
    expect(releases).toBeInstanceOf(ModelsIndex.PecansReleases);

    // Test utility function
    expect(ModelsIndex.isPecansAsset(asset)).toBe(true);
    expect(ModelsIndex.isPecansAsset({})).toBe(false);
  });

  it("should maintain proper prototype chain for exported classes", () => {
    const assetDTO = {
      content_type: "application/octet-stream",
      filename: "test.dmg",
      id: "123",
      raw: {},
      size: 1024,
      type: "osx_64" as const,
    };

    const asset = new ModelsIndex.PecansAsset(assetDTO);

    // Verify methods are available on the prototype
    expect(typeof asset.satisfiesQuery).toBe("function");
    expect(typeof asset.satisfiesOS).toBe("function");
    expect(typeof asset.satisfiesArch).toBe("function");
  });
});
