import { describe, expect, it } from "vitest";
import {
  ARCHITECTURES,
  isArchitecture,
  filenameToArchitecture,
  getSupportedArchByOs,
  isValidArchForOS,
} from "../../src/utils/Architecture.js";
import type { OperatingSystem } from "../../src/utils/OperatingSystem.js";

describe("Architecture", () => {
  describe("ARCHITECTURES constant", () => {
    it("should contain all expected architecture values", () => {
      expect(ARCHITECTURES).toEqual(["32", "64", "arm64", "universal"]);
    });
  });

  describe("isArchitecture", () => {
    it("should return true for valid architecture strings", () => {
      expect(isArchitecture("32")).toBe(true);
      expect(isArchitecture("64")).toBe(true);
      expect(isArchitecture("arm64")).toBe(true);
      expect(isArchitecture("universal")).toBe(true);
    });

    it("should return false for invalid architecture strings", () => {
      expect(isArchitecture("invalid")).toBe(false);
      expect(isArchitecture("x86")).toBe(false);
      expect(isArchitecture("")).toBe(false);
      expect(isArchitecture("ARM64")).toBe(false); // case sensitive
    });

    it("should return false for non-string values", () => {
      expect(isArchitecture(null)).toBe(false);
      expect(isArchitecture(undefined)).toBe(false);
      expect(isArchitecture(123)).toBe(false);
      expect(isArchitecture({})).toBe(false);
      expect(isArchitecture([])).toBe(false);
      expect(isArchitecture(true)).toBe(false);
    });
  });

  describe("filenameToArchitecture", () => {
    describe("special case handling", () => {
      it("should return universal for RELEASES file", () => {
        expect(filenameToArchitecture("RELEASES", "windows")).toBe("universal");
        expect(filenameToArchitecture("releases", "windows")).toBe("universal");
      });

      it("should detect universal architecture", () => {
        expect(filenameToArchitecture("app-universal.dmg", "osx")).toBe(
          "universal",
        );
        expect(filenameToArchitecture("app-univ.zip", "osx")).toBe("universal");
        expect(filenameToArchitecture("MyApp-Universal.exe", "windows")).toBe(
          "universal",
        );
      });

      it("should treat .msixbundle as universal even without the keyword", () => {
        // .msixbundle is a multi-arch bundle by definition (no arch in name)
        expect(
          filenameToArchitecture("Visibox-5.0.13.msixbundle", "windows"),
        ).toBe("universal");
        expect(filenameToArchitecture("APP.MSIXBUNDLE", "windows")).toBe(
          "universal",
        );
      });

      it("should still detect arch from .msix filename suffix", () => {
        // Single-arch .msix encodes arch in the filename (e.g. _x64, _arm64)
        expect(
          filenameToArchitecture("Visibox_5.0.13.0_x64.msix", "windows"),
        ).toBe("64");
        expect(
          filenameToArchitecture("Visibox_5.0.13.0_arm64.msix", "windows"),
        ).toBe("arm64");
        expect(
          filenameToArchitecture("Visibox_5.0.13.0_x86.msix", "windows"),
        ).toBe("32");
      });
    });

    describe("arm64 detection", () => {
      it("should detect arm64 architecture", () => {
        expect(filenameToArchitecture("app-arm64.dmg", "osx")).toBe("arm64");
        expect(filenameToArchitecture("myapp-darwin-arm64.zip", "osx")).toBe(
          "arm64",
        );
        expect(filenameToArchitecture("APP-ARM64.exe", "windows")).toBe(
          "arm64",
        );
      });

      it("should detect arm as arm64", () => {
        expect(filenameToArchitecture("app-arm.dmg", "osx")).toBe("arm64");
        expect(filenameToArchitecture("myapp-ARM.zip", "linux")).toBe("arm64");
      });
    });

    describe("32-bit detection", () => {
      it("should detect 32-bit architecture variants", () => {
        expect(filenameToArchitecture("app-32.exe", "windows")).toBe("32");
        expect(filenameToArchitecture("app-ia32.deb", "linux")).toBe("32");
        expect(filenameToArchitecture("app-i386.rpm", "linux")).toBe("32");
        expect(filenameToArchitecture("app-x86.zip", "windows")).toBe("32");
      });
    });

    describe("64-bit fallback", () => {
      it("should default to 64-bit for unrecognized patterns", () => {
        expect(filenameToArchitecture("app.dmg", "osx")).toBe("64");
        expect(filenameToArchitecture("myapp.exe", "windows")).toBe("64");
        expect(filenameToArchitecture("someapp-unknown.tar.gz", "linux")).toBe(
          "64",
        );
        expect(filenameToArchitecture("app-weird-name.zip", "osx")).toBe("64");
      });
    });

    describe("case insensitive matching", () => {
      it("should handle mixed case filenames", () => {
        expect(filenameToArchitecture("App-UNIVERSAL.DMG", "osx")).toBe(
          "universal",
        );
        expect(filenameToArchitecture("MyApp-ARM64.EXE", "windows")).toBe(
          "arm64",
        );
        expect(filenameToArchitecture("app-IA32.DEB", "linux")).toBe("32");
      });
    });
  });

  describe("getSupportedArchByOs", () => {
    it("should return correct architectures for osx", () => {
      const result = getSupportedArchByOs("osx");
      expect(result).toEqual(["64", "32", "arm64", "universal"]);
    });

    it("should return correct architectures for windows", () => {
      const result = getSupportedArchByOs("windows");
      expect(result).toEqual(["32", "64", "universal"]);
    });

    it("should return correct architectures for linux", () => {
      const result = getSupportedArchByOs("linux");
      expect(result).toEqual(["32", "64"]);
    });

    it("should handle default case (same as linux)", () => {
      // Testing the default case by using an invalid OS that falls through
      const result = getSupportedArchByOs("invalid" as OperatingSystem);
      expect(result).toEqual(["32", "64"]);
    });
  });

  describe("isValidArchForOS", () => {
    describe("osx validation", () => {
      it("should validate all supported osx architectures", () => {
        expect(isValidArchForOS("osx", "32")).toBe(true);
        expect(isValidArchForOS("osx", "64")).toBe(true);
        expect(isValidArchForOS("osx", "arm64")).toBe(true);
        expect(isValidArchForOS("osx", "universal")).toBe(true);
      });

      it("should reject invalid osx architectures", () => {
        expect(isValidArchForOS("osx", "invalid")).toBe(false);
        expect(isValidArchForOS("osx", "x86")).toBe(false);
      });
    });

    describe("windows validation", () => {
      it("should validate supported windows architectures", () => {
        expect(isValidArchForOS("windows", "32")).toBe(true);
        expect(isValidArchForOS("windows", "64")).toBe(true);
        expect(isValidArchForOS("windows", "universal")).toBe(true);
      });

      it("should reject invalid windows architectures", () => {
        expect(isValidArchForOS("windows", "arm64")).toBe(false);
        expect(isValidArchForOS("windows", "invalid")).toBe(false);
      });
    });

    describe("linux validation", () => {
      it("should validate supported linux architectures", () => {
        expect(isValidArchForOS("linux", "32")).toBe(true);
        expect(isValidArchForOS("linux", "64")).toBe(true);
      });

      it("should reject invalid linux architectures", () => {
        expect(isValidArchForOS("linux", "arm64")).toBe(false);
        expect(isValidArchForOS("linux", "universal")).toBe(false);
        expect(isValidArchForOS("linux", "invalid")).toBe(false);
      });
    });

    describe("default OS validation", () => {
      it("should handle unknown OS same as linux", () => {
        const invalidOS = "unknown" as OperatingSystem;
        expect(isValidArchForOS(invalidOS, "32")).toBe(true);
        expect(isValidArchForOS(invalidOS, "64")).toBe(true);
        expect(isValidArchForOS(invalidOS, "arm64")).toBe(false);
        expect(isValidArchForOS(invalidOS, "universal")).toBe(false);
      });
    });
  });
});
