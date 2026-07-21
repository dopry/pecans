import QueryString from "qs";
import { describe, expect, it } from "vitest";
import {
  OPERATING_SYSTEMS,
  filenameToOperatingSystem,
  getOsFromQuery,
  isOperatingSystem,
} from "../../src/utils/OperatingSystem.js";

describe("OperatingSystem", () => {
  describe("OPERATING_SYSTEMS constant", () => {
    it("should contain all expected operating systems", () => {
      expect(OPERATING_SYSTEMS).toEqual(["linux", "osx", "windows"]);
    });
  });

  describe("isOperatingSystem", () => {
    it("should return true for valid operating systems", () => {
      expect(isOperatingSystem("linux")).toBe(true);
      expect(isOperatingSystem("osx")).toBe(true);
      expect(isOperatingSystem("windows")).toBe(true);
    });

    it("should return false for invalid operating systems", () => {
      expect(isOperatingSystem("android")).toBe(false);
      expect(isOperatingSystem("ios")).toBe(false);
      expect(isOperatingSystem("freebsd")).toBe(false);
      expect(isOperatingSystem("")).toBe(false);
      expect(isOperatingSystem("LINUX")).toBe(false); // case sensitive
    });

    it("should return false for non-string values", () => {
      expect(isOperatingSystem(null)).toBe(false);
      expect(isOperatingSystem(undefined)).toBe(false);
      expect(isOperatingSystem(123)).toBe(false);
      expect(isOperatingSystem({})).toBe(false);
      expect(isOperatingSystem([])).toBe(false);
      expect(isOperatingSystem(true)).toBe(false);
    });
  });

  describe("filenameToOperatingSystem", () => {
    describe("Windows detection", () => {
      it("should detect Windows from special file: RELEASES", () => {
        expect(filenameToOperatingSystem("RELEASES")).toBe("windows");
        expect(filenameToOperatingSystem("releases")).toBe("windows");
      });

      it("should detect Windows from win32/win64 patterns", () => {
        expect(filenameToOperatingSystem("myapp-win32.zip")).toBe("windows");
        expect(filenameToOperatingSystem("software-win64-x64.zip")).toBe(
          "windows",
        );
        expect(filenameToOperatingSystem("app-WIN32.exe")).toBe("windows");
      });

      it("should detect Windows from .exe extension", () => {
        expect(filenameToOperatingSystem("installer.exe")).toBe("windows");
        expect(filenameToOperatingSystem("MyApp-Setup.EXE")).toBe("windows");
      });

      it("should detect Windows from .nupkg extension", () => {
        expect(filenameToOperatingSystem("update.nupkg")).toBe("windows");
        expect(filenameToOperatingSystem("app-1.0.0.NUPKG")).toBe("windows");
      });

      it("should detect Windows from .msix and .msixbundle extensions", () => {
        expect(filenameToOperatingSystem("Visibox_5.0.13.0_x64.msix")).toBe(
          "windows",
        );
        expect(filenameToOperatingSystem("Visibox-5.0.13.msixbundle")).toBe(
          "windows",
        );
        expect(filenameToOperatingSystem("APP.MSIX")).toBe("windows");
        expect(filenameToOperatingSystem("APP.MSIXBUNDLE")).toBe("windows");
      });
    });

    describe("Linux detection", () => {
      it("should detect Linux from linux keyword", () => {
        expect(filenameToOperatingSystem("myapp-linux.tar.gz")).toBe("linux");
        expect(filenameToOperatingSystem("software-LINUX-amd64.tgz")).toBe(
          "linux",
        );
      });

      it("should detect Linux from ubuntu keyword", () => {
        expect(filenameToOperatingSystem("myapp-ubuntu.deb")).toBe("linux");
        expect(filenameToOperatingSystem("software-UBUNTU-18.04.deb")).toBe(
          "linux",
        );
      });

      it("should detect Linux from .deb extension", () => {
        expect(filenameToOperatingSystem("package.deb")).toBe("linux");
        expect(filenameToOperatingSystem("myapp-amd64.DEB")).toBe("linux");
      });

      it("should detect Linux from .rpm extension", () => {
        expect(filenameToOperatingSystem("package.rpm")).toBe("linux");
        expect(filenameToOperatingSystem("software-x86_64.RPM")).toBe("linux");
      });

      it("should detect Linux from .tgz extension", () => {
        expect(filenameToOperatingSystem("archive.tgz")).toBe("linux");
        expect(filenameToOperatingSystem("myapp-linux.TGZ")).toBe("linux");
      });

      it("should detect Linux from .tar.gz extension", () => {
        expect(filenameToOperatingSystem("package.tar.gz")).toBe("linux");
        expect(filenameToOperatingSystem("myapp-1.0.0.TAR.GZ")).toBe("linux");
      });
    });

    describe("OSX detection", () => {
      it("should detect OSX from mac keyword", () => {
        expect(filenameToOperatingSystem("myapp-mac.zip")).toBe("osx");
        expect(filenameToOperatingSystem("software-MAC-universal.dmg")).toBe(
          "osx",
        );
      });

      it("should detect OSX from osx keyword", () => {
        expect(filenameToOperatingSystem("myapp-osx.zip")).toBe("osx");
        expect(filenameToOperatingSystem("software-OSX-x64.dmg")).toBe("osx");
      });

      it("should detect OSX from darwin keyword", () => {
        expect(filenameToOperatingSystem("myapp-darwin.zip")).toBe("osx");
        expect(filenameToOperatingSystem("software-DARWIN-arm64.dmg")).toBe(
          "osx",
        );
      });

      it("should detect OSX from .dmg extension", () => {
        expect(filenameToOperatingSystem("installer.dmg")).toBe("osx");
        expect(filenameToOperatingSystem("MyApp-Setup.DMG")).toBe("osx");
      });
    });

    describe("Error handling", () => {
      it("should throw error for unrecognizable filenames", () => {
        expect(() => filenameToOperatingSystem("unknown-file.txt")).toThrow(
          "Unable to determine OS from filename.",
        );
        expect(() => filenameToOperatingSystem("README")).toThrow(
          "Unable to determine OS from filename.",
        );
        expect(() => filenameToOperatingSystem("config.json")).toThrow(
          "Unable to determine OS from filename.",
        );
      });
    });
  });

  describe("getOsFromQuery", () => {
    it("should return valid operating system from query", () => {
      const linuxQuery: QueryString.ParsedQs = { os: "linux" };
      expect(getOsFromQuery(linuxQuery)).toBe("linux");

      const osxQuery: QueryString.ParsedQs = { os: "osx" };
      expect(getOsFromQuery(osxQuery)).toBe("osx");

      const windowsQuery: QueryString.ParsedQs = { os: "windows" };
      expect(getOsFromQuery(windowsQuery)).toBe("windows");
    });

    it("should return undefined for invalid operating systems", () => {
      const invalidQueries: QueryString.ParsedQs[] = [
        { os: "android" },
        { os: "ios" },
        { os: "freebsd" },
        { os: "" },
        { os: "LINUX" }, // case sensitive
      ];

      invalidQueries.forEach((query) => {
        expect(getOsFromQuery(query)).toBe(undefined);
      });
    });

    it("should return undefined when os is not a string", () => {
      const nonStringQueries: QueryString.ParsedQs[] = [
        { os: 123 as any },
        { os: true as any },
        { os: {} as any },
        { os: [] as any },
        { os: ["linux", "windows"] }, // array
      ];

      nonStringQueries.forEach((query) => {
        expect(getOsFromQuery(query)).toBe(undefined);
      });
    });

    it("should return undefined when os is missing", () => {
      const missingOsQueries: QueryString.ParsedQs[] = [
        {},
        { other: "value" },
        { os: undefined },
      ];

      missingOsQueries.forEach((query) => {
        expect(getOsFromQuery(query)).toBe(undefined);
      });
    });

    it("should handle complex query objects", () => {
      const complexQuery: QueryString.ParsedQs = {
        os: "linux",
        version: "1.0.0",
        arch: "amd64",
        other: ["value1", "value2"],
      };
      expect(getOsFromQuery(complexQuery)).toBe("linux");
    });
  });
});
