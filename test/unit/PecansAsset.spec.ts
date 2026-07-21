import { describe, expect, it } from "vitest";
import {
  PecansAsset,
  type PecansAssetDTO,
} from "../../src/models/PecansAsset.js";
import type { PecansAssetQuery } from "../../src/models/PecansAssetQuery.js";

describe("PecansAsset", () => {
  const createMockAssetDTO = (
    overrides: Partial<PecansAssetDTO> = {},
  ): PecansAssetDTO => ({
    content_type: "application/octet-stream",
    filename: "test-app-osx_64.dmg",
    id: "123",
    raw: { test: "data" },
    size: 1024,
    type: "osx_64",
    ...overrides,
  });

  describe("constructor", () => {
    it("should create instance with all properties from DTO", () => {
      const dto = createMockAssetDTO();
      const asset = new PecansAsset(dto);

      expect(asset.content_type).toBe(dto.content_type);
      expect(asset.filename).toBe(dto.filename);
      expect(asset.id).toBe(dto.id);
      expect(asset.raw).toBe(dto.raw);
      expect(asset.size).toBe(dto.size);
      expect(asset.type).toBe(dto.type);
    });

    it("should derive OS from filename", () => {
      const asset = new PecansAsset(
        createMockAssetDTO({
          filename: "app-darwin-x64.dmg",
        }),
      );
      expect(asset.os).toBe("osx");
    });

    it("should derive architecture from filename", () => {
      const asset = new PecansAsset(
        createMockAssetDTO({
          filename: "app-darwin-x64.dmg",
        }),
      );
      expect(asset.arch).toBe("64");
    });

    it("should derive package format from filename", () => {
      const asset = new PecansAsset(
        createMockAssetDTO({
          filename: "app-linux-amd64.deb",
        }),
      );
      expect(asset.pkg).toBe("deb");
    });

    it("should handle filename without package format", () => {
      const asset = new PecansAsset(
        createMockAssetDTO({
          filename: "app-osx.dmg",
        }),
      );
      expect(asset.pkg).toBeUndefined();
    });

    // raw is backend-private: the model carries it verbatim for the backend
    // that created the asset and never interprets it
    it("should pass the raw payload through untouched", () => {
      const raw = {
        browser_download_url: "https://github.com/o/r/releases/d/app.dmg",
        url: "https://api.github.com/repos/o/r/releases/assets/1",
      };
      const asset = new PecansAsset(createMockAssetDTO({ raw }));
      expect(asset.raw).toBe(raw);
    });
  });

  describe("satisfiesQuery", () => {
    it("should return true when query is empty", () => {
      const asset = new PecansAsset(createMockAssetDTO());
      expect(asset.satisfiesQuery({})).toBe(true);
    });

    it("should return true when all query conditions match", () => {
      const asset = new PecansAsset(
        createMockAssetDTO({
          filename: "test-linux-amd64.deb",
        }),
      );
      const query: PecansAssetQuery = {
        os: "linux",
        arch: "64",
        pkg: "deb",
        filename: "test-linux-amd64.deb",
        extensions: [".deb"],
      };
      expect(asset.satisfiesQuery(query)).toBe(true);
    });

    it("should return false when any query condition fails", () => {
      const asset = new PecansAsset(
        createMockAssetDTO({
          filename: "test-osx.dmg",
        }),
      );
      const query: PecansAssetQuery = {
        os: "linux", // Asset is osx, query wants linux
      };
      expect(asset.satisfiesQuery(query)).toBe(false);
    });
  });

  describe("satisfiesOS", () => {
    const asset = new PecansAsset(
      createMockAssetDTO({
        filename: "test-osx.dmg", // This will set os to "osx"
      }),
    );

    it("should return true when os is undefined", () => {
      expect(asset.satisfiesOS(undefined)).toBe(true);
    });

    it("should return true when os matches", () => {
      expect(asset.satisfiesOS("osx")).toBe(true);
    });

    it("should return false when os does not match", () => {
      expect(asset.satisfiesOS("linux")).toBe(false);
    });
  });

  describe("satisfiesArch", () => {
    const asset = new PecansAsset(
      createMockAssetDTO({
        filename: "test-osx-arm64.dmg", // This will set arch to "arm64"
      }),
    );

    it("should return true when arch is undefined", () => {
      expect(asset.satisfiesArch(undefined)).toBe(true);
    });

    it("should return true when arch matches", () => {
      expect(asset.satisfiesArch("arm64")).toBe(true);
    });

    it("should return false when arch does not match", () => {
      expect(asset.satisfiesArch("64")).toBe(false);
    });
  });

  describe("satisfiesPkg", () => {
    const assetWithPkg = new PecansAsset(
      createMockAssetDTO({
        filename: "test-linux.deb", // This will set pkg to "deb"
      }),
    );

    const assetWithoutPkg = new PecansAsset(
      createMockAssetDTO({
        filename: "test-osx.dmg", // This will have undefined pkg
      }),
    );

    it("should return true when pkg is undefined", () => {
      expect(assetWithPkg.satisfiesPkg(undefined)).toBe(true);
      expect(assetWithoutPkg.satisfiesPkg(undefined)).toBe(true);
    });

    it("should return true when pkg matches", () => {
      expect(assetWithPkg.satisfiesPkg("deb")).toBe(true);
    });

    it("should return false when pkg does not match", () => {
      expect(assetWithPkg.satisfiesPkg("rpm")).toBe(false);
    });

    it("should return false when asset has no pkg but query requires one", () => {
      expect(assetWithoutPkg.satisfiesPkg("deb")).toBe(false);
    });
  });

  describe("satisfiesFilename", () => {
    const asset = new PecansAsset(
      createMockAssetDTO({
        filename: "test-app.dmg",
      }),
    );

    it("should return true when filename is undefined", () => {
      expect(asset.satisfiesFilename(undefined)).toBe(true);
    });

    it("should return true when filename matches exactly", () => {
      expect(asset.satisfiesFilename("test-app.dmg")).toBe(true);
    });

    it("should return false when filename does not match", () => {
      expect(asset.satisfiesFilename("other-app.dmg")).toBe(false);
    });
  });

  describe("satisfiesExtensions", () => {
    const asset = new PecansAsset(
      createMockAssetDTO({
        filename: "test-app.dmg",
      }),
    );

    it("should return true when extensions is undefined", () => {
      expect(asset.satisfiesExtensions(undefined)).toBe(true);
    });

    it("should return true when file extension is in allowed extensions", () => {
      expect(asset.satisfiesExtensions([".dmg", ".zip"])).toBe(true);
    });

    it("should return false when file extension is not in allowed extensions", () => {
      expect(asset.satisfiesExtensions([".deb", ".rpm"])).toBe(false);
    });

    it("should handle files without extensions", () => {
      const assetNoExt = new PecansAsset(
        createMockAssetDTO({
          filename: "RELEASES",
        }),
      );
      expect(assetNoExt.satisfiesExtensions([".dmg"])).toBe(false);
      // Files without extension should return false for any extension list
      expect(assetNoExt.satisfiesExtensions([".exe"])).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle complex filenames", () => {
      const asset = new PecansAsset(
        createMockAssetDTO({
          filename: "my-app-v1.2.3-darwin-universal.dmg",
        }),
      );
      expect(asset.os).toBe("osx");
      expect(asset.arch).toBe("universal");
    });

    it("should handle Windows files", () => {
      const asset = new PecansAsset(
        createMockAssetDTO({
          filename: "MyAppSetup.exe",
        }),
      );
      expect(asset.os).toBe("windows");
      expect(asset.arch).toBe("64");
    });

    it("should handle Linux RPM files", () => {
      const asset = new PecansAsset(
        createMockAssetDTO({
          filename: "myapp-1.0.0-x86_64.rpm",
        }),
      );
      expect(asset.os).toBe("linux");
      expect(asset.pkg).toBe("rpm");
    });
  });
});
