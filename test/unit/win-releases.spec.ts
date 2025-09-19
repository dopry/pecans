import { describe, it, expect } from "vitest";
import {
  normVersion,
  toSemver,
  parseRELEASES,
  generateRELEASES,
} from "../../src/utils/win-releases";

describe("Windows RELEASES", function () {
  describe("Version Normalization", function () {
    it("should not changed version without pre-release", function () {
      expect(normVersion("1.0.0")).toBe("1.0.0");
      expect(normVersion("4.5.0")).toBe("4.5.0");
      expect(normVersion("67.8.345")).toBe("67.8.345");
    });

    it("should normalize the pre-release", function () {
      expect(normVersion("1.0.0-alpha.1")).toBe("1.0.0.1001");
      expect(normVersion("1.0.0-beta.1")).toBe("1.0.0.2001");
      expect(normVersion("1.0.0-unstable.1")).toBe("1.0.0.3001");
      expect(normVersion("1.0.0-rc.1")).toBe("1.0.0.4001");
      expect(normVersion("1.0.0-14")).toBe("1.0.0.14");
    });

    it("should correctly return to a semver", function () {
      expect(toSemver("1.0.0.1001")).toBe("1.0.0-alpha.1");
      expect(toSemver("1.0.0.2001")).toBe("1.0.0-beta.1");
      expect(toSemver("1.0.0.2015")).toBe("1.0.0-beta.15");
      expect(toSemver("1.0.0")).toBe("1.0.0");
    });
  });

  describe("Parsing", async function () {
    const releases = await parseRELEASES(
      "62E8BF432F29E8E08240910B85EDBF2D1A41EDF2 atom-0.178.0-full.nupkg 81272434\n" +
        "5D754139E89802E88984185D2276B54DB730CD5E atom-0.178.1-delta.nupkg 8938535\n" +
        "DD48D16EE177DD278F0A82CDDB72EBD043C767D2 atom-0.178.1-full.nupkg 81293415\n" +
        "02D56FF2DD6CB8FE059167E227433078CDAF5630 atom-0.179.0-delta.nupkg 9035217\n" +
        "8F5FDFD0BD81475EAD95E9E415579A852476E5FC atom-0.179.0-full.nupkg 81996151"
    );

    it("should have parsed all lines", function () {
      expect(Array.isArray(releases)).toBe(true);
      expect(releases.length).toBe(5);
    });

    it("should parse a one-line file (with utf-8 BOM)", async function () {
      const oneRelease = await parseRELEASES(
        "\uFEFF24182FAD211FB9EB72610B1C086810FE37F70AE3 gitbook-editor-4.0.0-full.nupkg 46687158"
      );
      expect(oneRelease.length).toBe(1);
    });

    it("should correctly parse sha, version, isDelta, filename and size", function () {
      expect(typeof releases[0].sha).toBe("string");
      expect(releases[0].sha).toBe("62E8BF432F29E8E08240910B85EDBF2D1A41EDF2");

      expect(typeof releases[0].filename).toBe("string");
      expect(releases[0].filename).toBe("atom-0.178.0-full.nupkg");

      expect(typeof releases[0].size).toBe("number");
      expect(releases[0].size).toBe(81272434);

      expect(typeof releases[0].isDelta).toBe("boolean");
      expect(typeof releases[0].version).toBe("string");
    });

    it("should correctly detect deltas", function () {
      expect(releases[0].isDelta).toBe(false);
      expect(releases[1].isDelta).toBe(true);
    });

    it("should correctly parse versions", function () {
      expect(releases[0].version).toBe("0.178.0");
      expect(releases[1].version).toBe("0.178.1");
    });
  });

  describe("Generations", async function () {
    const input =
      "62E8BF432F29E8E08240910B85EDBF2D1A41EDF2 atom-0.178.0-full.nupkg 81272434\n" +
      "5D754139E89802E88984185D2276B54DB730CD5E atom-0.178.1-delta.nupkg 8938535\n" +
      "DD48D16EE177DD278F0A82CDDB72EBD043C767D2 atom-0.178.1-full.nupkg 81293415\n" +
      "02D56FF2DD6CB8FE059167E227433078CDAF5630 atom-0.179.0-delta.nupkg 9035217\n" +
      "8F5FDFD0BD81475EAD95E9E415579A852476E5FC atom-0.179.0-full.nupkg 81996151";

    const releases = await parseRELEASES(input);

    it("should correctly generate a RELEASES file", function () {
      expect(generateRELEASES(releases)).toBe(input);
    });

    it("should correctly generate filenames", function () {
      expect(
        generateRELEASES([
          {
            sha: "62E8BF432F29E8E08240910B85EDBF2D1A41EDF2",
            version: "1.0.0",
            app: "atom",
            size: 81272434,
            isDelta: false,
            filename: "",
            semver: "",
          },
        ])
      ).toBe(
        "62E8BF432F29E8E08240910B85EDBF2D1A41EDF2 atom-1.0.0-full.nupkg 81272434"
      );
    });
  });
});
