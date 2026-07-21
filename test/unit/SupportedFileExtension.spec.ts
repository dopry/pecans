import { describe, expect, it } from "vitest";
import {
  SUPPORTED_FILE_EXTENSIONS,
  isSupportedFileExtension,
  getSupportedExt,
  getDownloadExtensionsByOs,
} from "../../src/utils/SupportedFileExtension.js";
import type { OperatingSystem } from "../../src/utils/OperatingSystem.js";
import type { PackageFormat } from "../../src/utils/PackageFormat.js";

describe("SupportedFileExtension", () => {
  describe("SUPPORTED_FILE_EXTENSIONS constant", () => {
    it("should contain all expected file extensions", () => {
      expect(SUPPORTED_FILE_EXTENSIONS).toEqual([
        ".exe",
        ".dmg",
        ".deb",
        ".rpm",
        ".tgz",
        ".tar.gz",
        ".zip",
        ".nupkg",
        ".msix",
        ".msixbundle",
      ]);
    });
  });

  describe("isSupportedFileExtension", () => {
    it("should return true for valid file extensions", () => {
      expect(isSupportedFileExtension(".exe")).toBe(true);
      expect(isSupportedFileExtension(".dmg")).toBe(true);
      expect(isSupportedFileExtension(".deb")).toBe(true);
      expect(isSupportedFileExtension(".rpm")).toBe(true);
      expect(isSupportedFileExtension(".tgz")).toBe(true);
      expect(isSupportedFileExtension(".tar.gz")).toBe(true);
      expect(isSupportedFileExtension(".zip")).toBe(true);
      expect(isSupportedFileExtension(".nupkg")).toBe(true);
      expect(isSupportedFileExtension(".msix")).toBe(true);
      expect(isSupportedFileExtension(".msixbundle")).toBe(true);
    });

    it("should return false for invalid file extensions", () => {
      expect(isSupportedFileExtension(".txt")).toBe(false);
      expect(isSupportedFileExtension(".pdf")).toBe(false);
      expect(isSupportedFileExtension(".msi")).toBe(false);
      expect(isSupportedFileExtension(".appx")).toBe(false);
      expect(isSupportedFileExtension(".appxbundle")).toBe(false);
      expect(isSupportedFileExtension(".appimage")).toBe(false);
      expect(isSupportedFileExtension("")).toBe(false);
      expect(isSupportedFileExtension(".EXE")).toBe(false); // case sensitive
      expect(isSupportedFileExtension(".MSIX")).toBe(false); // case sensitive
    });

    it("should return false for non-string values", () => {
      expect(isSupportedFileExtension(null)).toBe(false);
      expect(isSupportedFileExtension(undefined)).toBe(false);
      expect(isSupportedFileExtension(123)).toBe(false);
      expect(isSupportedFileExtension({})).toBe(false);
      expect(isSupportedFileExtension([])).toBe(false);
      expect(isSupportedFileExtension(true)).toBe(false);
    });
  });

  describe("getSupportedExt", () => {
    it("should handle .tar.gz special case", () => {
      expect(getSupportedExt("myapp-1.0.0.tar.gz")).toBe(".tar.gz");
      expect(getSupportedExt("app.linux.tar.gz")).toBe(".tar.gz");
      expect(getSupportedExt("package-v2.1.0-linux.tar.gz")).toBe(".tar.gz");
    });

    it("should extract regular file extensions", () => {
      expect(getSupportedExt("myapp.exe")).toBe(".exe");
      expect(getSupportedExt("installer.dmg")).toBe(".dmg");
      expect(getSupportedExt("package.deb")).toBe(".deb");
      expect(getSupportedExt("software.rpm")).toBe(".rpm");
      expect(getSupportedExt("archive.tgz")).toBe(".tgz");
      expect(getSupportedExt("release.zip")).toBe(".zip");
      expect(getSupportedExt("update.nupkg")).toBe(".nupkg");
      expect(getSupportedExt("Visibox-5.0.13_x64.msix")).toBe(".msix");
      expect(getSupportedExt("Visibox-5.0.13.msixbundle")).toBe(".msixbundle");
    });

    it("should return undefined for unsupported extensions", () => {
      expect(getSupportedExt("document.txt")).toBe(undefined);
      expect(getSupportedExt("image.png")).toBe(undefined);
      expect(getSupportedExt("video.mp4")).toBe(undefined);
      expect(getSupportedExt("archive.7z")).toBe(undefined);
      expect(getSupportedExt("installer.msi")).toBe(undefined);
    });

    it("should handle files without extensions", () => {
      expect(getSupportedExt("README")).toBe(undefined);
      expect(getSupportedExt("CHANGELOG")).toBe(undefined);
      expect(getSupportedExt("LICENSE")).toBe(undefined);
    });

    it("should handle complex filenames", () => {
      expect(getSupportedExt("my-app-v1.2.3-win32-x64.exe")).toBe(".exe");
      expect(getSupportedExt("software-2.0.0-darwin-universal.dmg")).toBe(
        ".dmg",
      );
      expect(getSupportedExt("package-1.5.0-linux-amd64.tar.gz")).toBe(
        ".tar.gz",
      );
      expect(getSupportedExt("app-3.1.0.linux.x86_64.rpm")).toBe(".rpm");
    });
  });

  describe("getDownloadExtensionsByOs", () => {
    describe("osx", () => {
      it("should return dmg for osx", () => {
        expect(getDownloadExtensionsByOs("osx")).toEqual([".dmg"]);
        expect(getDownloadExtensionsByOs("osx", "deb")).toEqual([".dmg"]);
        expect(getDownloadExtensionsByOs("osx", "rpm")).toEqual([".dmg"]);
      });
    });

    describe("windows", () => {
      it("should return exe for windows by default", () => {
        expect(getDownloadExtensionsByOs("windows")).toEqual([".exe"]);
        expect(getDownloadExtensionsByOs("windows", "deb")).toEqual([".exe"]);
        expect(getDownloadExtensionsByOs("windows", "rpm")).toEqual([".exe"]);
      });

      it("should return msix extensions for windows when pkg=msix", () => {
        // .msixbundle is preferred (covers multiple architectures);
        // .msix is the single-arch fallback when no bundle is published.
        expect(getDownloadExtensionsByOs("windows", "msix")).toEqual([
          ".msixbundle",
          ".msix",
        ]);
      });
    });

    describe("linux", () => {
      it("should return deb extensions when package format is deb", () => {
        expect(getDownloadExtensionsByOs("linux", "deb")).toEqual([
          ".deb",
          ".tgz",
          ".tar.gz",
        ]);
      });

      it("should return rpm extensions when package format is rpm", () => {
        expect(getDownloadExtensionsByOs("linux", "rpm")).toEqual([
          ".rpm",
          ".tgz",
          ".tar.gz",
        ]);
      });

      it("should return default linux extensions when no package format specified", () => {
        expect(getDownloadExtensionsByOs("linux")).toEqual([".tgz", ".tar.gz"]);
      });

      it("should return default linux extensions for unknown package format", () => {
        expect(
          getDownloadExtensionsByOs("linux", "unknown" as PackageFormat),
        ).toEqual([".tgz", ".tar.gz"]);
      });
    });

    describe("edge cases", () => {
      it("should throw for unknown operating systems", () => {
        // an invalid OS cast in at runtime must fail loudly rather than
        // silently returning undefined against the declared return type
        expect(() =>
          getDownloadExtensionsByOs("unknown" as OperatingSystem),
        ).toThrow("Unsupported operating system");
      });
    });
  });
});
