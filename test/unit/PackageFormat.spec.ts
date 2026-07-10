import { describe, expect, it } from "vitest";
import {
  PACKAGE_FORMATS,
  isPackageFormat,
  filenameToPackageFormat,
  getPkgFromQuery,
} from "../../src/utils/PackageFormat";
import { ParsedQs } from "qs";

describe("PackageFormat", () => {
  describe("PACKAGE_FORMATS constant", () => {
    it("should contain all expected package formats", () => {
      expect(PACKAGE_FORMATS).toEqual(["deb", "rpm"]);
    });
  });

  describe("isPackageFormat", () => {
    it("should return true for valid package formats", () => {
      expect(isPackageFormat("deb")).toBe(true);
      expect(isPackageFormat("rpm")).toBe(true);
    });

    it("should return false for invalid package formats", () => {
      expect(isPackageFormat("zip")).toBe(false);
      expect(isPackageFormat("dmg")).toBe(false);
      expect(isPackageFormat("tar")).toBe(false);
      expect(isPackageFormat("nupkg")).toBe(false);
      expect(isPackageFormat("invalid")).toBe(false);
      expect(isPackageFormat("")).toBe(false);
      expect(isPackageFormat("DEB")).toBe(false); // case sensitive
    });

    it("should return false for non-string values", () => {
      expect(isPackageFormat(null)).toBe(false);
      expect(isPackageFormat(undefined)).toBe(false);
      expect(isPackageFormat(123)).toBe(false);
      expect(isPackageFormat({})).toBe(false);
      expect(isPackageFormat([])).toBe(false);
      expect(isPackageFormat(true)).toBe(false);
    });
  });

  describe("filenameToPackageFormat", () => {
    it("should detect deb packages", () => {
      expect(filenameToPackageFormat("package.deb")).toBe("deb");
      expect(filenameToPackageFormat("myapp-1.0.0.deb")).toBe("deb");
      expect(filenameToPackageFormat("software-amd64.deb")).toBe("deb");
      expect(filenameToPackageFormat("APP.DEB")).toBe("deb"); // case insensitive
    });

    it("should detect rpm packages", () => {
      expect(filenameToPackageFormat("package.rpm")).toBe("rpm");
      expect(filenameToPackageFormat("myapp-1.0.0.rpm")).toBe("rpm");
      expect(filenameToPackageFormat("software-x86_64.rpm")).toBe("rpm");
      expect(filenameToPackageFormat("APP.RPM")).toBe("rpm"); // case insensitive
    });

    it("should return undefined for unsupported formats", () => {
      expect(filenameToPackageFormat("package.zip")).toBe(undefined);
      expect(filenameToPackageFormat("installer.dmg")).toBe(undefined);
      expect(filenameToPackageFormat("archive.tar.gz")).toBe(undefined);
      expect(filenameToPackageFormat("update.nupkg")).toBe(undefined);
      expect(filenameToPackageFormat("app.exe")).toBe(undefined);
    });

    it("should return undefined for files without extensions", () => {
      expect(filenameToPackageFormat("README")).toBe(undefined);
      expect(filenameToPackageFormat("LICENSE")).toBe(undefined);
      expect(filenameToPackageFormat("CHANGELOG")).toBe(undefined);
    });

    it("should handle complex filenames", () => {
      expect(filenameToPackageFormat("my-app-v1.2.3-linux-amd64.deb")).toBe(
        "deb",
      );
      expect(filenameToPackageFormat("software-2.0.0-1.el8.x86_64.rpm")).toBe(
        "rpm",
      );
      expect(filenameToPackageFormat("package-1.0-rc1.noarch.rpm")).toBe("rpm");
    });
  });

  describe("getPkgFromQuery", () => {
    it("should return valid package format from query", () => {
      const query: ParsedQs = { pkg: "deb" };
      expect(getPkgFromQuery(query)).toBe("deb");
    });

    it("should return valid rpm package format from query", () => {
      const query: ParsedQs = { pkg: "rpm" };
      expect(getPkgFromQuery(query)).toBe("rpm");
    });

    it("should return undefined for invalid package formats", () => {
      const invalidQueries: ParsedQs[] = [
        { pkg: "zip" },
        { pkg: "dmg" },
        { pkg: "invalid" },
        { pkg: "" },
        { pkg: "DEB" }, // case sensitive
      ];

      invalidQueries.forEach((query) => {
        expect(getPkgFromQuery(query)).toBe(undefined);
      });
    });

    it("should return undefined when pkg is not a string", () => {
      const nonStringQueries: ParsedQs[] = [
        { pkg: 123 as any },
        { pkg: true as any },
        { pkg: {} as any },
        { pkg: [] as any },
        { pkg: ["deb", "rpm"] }, // array
      ];

      nonStringQueries.forEach((query) => {
        expect(getPkgFromQuery(query)).toBe(undefined);
      });
    });

    it("should return undefined when pkg is missing", () => {
      const missingPkgQueries: ParsedQs[] = [
        {},
        { other: "value" },
        { pkg: undefined },
      ];

      missingPkgQueries.forEach((query) => {
        expect(getPkgFromQuery(query)).toBe(undefined);
      });
    });

    it("should handle complex query objects", () => {
      const complexQuery: ParsedQs = {
        pkg: "deb",
        version: "1.0.0",
        arch: "amd64",
        other: ["value1", "value2"],
      };
      expect(getPkgFromQuery(complexQuery)).toBe("deb");
    });
  });
});
