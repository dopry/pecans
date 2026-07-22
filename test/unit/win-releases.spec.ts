import { describe, it, expect, vi } from "vitest";
import {
  normVersion,
  toSemver,
  parseRELEASES,
  generateRELEASES,
} from "../../src/utils/win-releases.js";

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
        "8F5FDFD0BD81475EAD95E9E415579A852476E5FC atom-0.179.0-full.nupkg 81996151",
    );

    it("should have parsed all lines", function () {
      expect(Array.isArray(releases)).toBe(true);
      expect(releases.length).toBe(5);
    });

    it("should normalize every CRLF, not just the first one", async function () {
      // the line regex tolerates a trailing \r ([\r]*$), so parsed output
      // alone can't distinguish full normalization from first-only
      // String#replace; capture the lines actually handed to the regex and
      // assert none still carries a \r
      const seenLines: string[] = [];
      const originalExec = RegExp.prototype.exec;
      const spy = vi
        .spyOn(RegExp.prototype, "exec")
        .mockImplementation(function (this: RegExp, str: string) {
          seenLines.push(str);
          return originalExec.call(this, str);
        });
      let crlfReleases;
      try {
        crlfReleases = await parseRELEASES(
          "62E8BF432F29E8E08240910B85EDBF2D1A41EDF2 atom-0.178.0-full.nupkg 81272434\r\n" +
            "5D754139E89802E88984185D2276B54DB730CD5E atom-0.178.1-delta.nupkg 8938535\r\n" +
            "DD48D16EE177DD278F0A82CDDB72EBD043C767D2 atom-0.178.1-full.nupkg 81293415",
        );
      } finally {
        // restore even if parseRELEASES throws, or the global spy would
        // leak into subsequent tests
        spy.mockRestore();
      }

      expect(crlfReleases.length).toBe(3);
      expect(crlfReleases[2].filename).toBe("atom-0.178.1-full.nupkg");
      expect(crlfReleases[2].size).toBe(81293415);
      // with first-only replacement the second line (any CRLF-terminated
      // line after the first) would still end in \r when it reaches the
      // regex; the last line has no CRLF terminator
      expect(seenLines.length).toBeGreaterThan(0);
      expect(seenLines.some((line) => line.includes("\r"))).toBe(false);
    });

    it("should parse a one-line file (with utf-8 BOM)", async function () {
      const oneRelease = await parseRELEASES(
        "\uFEFF24182FAD211FB9EB72610B1C086810FE37F70AE3 gitbook-editor-4.0.0-full.nupkg 46687158",
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

  describe("Parsing Edge Cases", function () {
    it("should handle invalid lines by filtering them out", async function () {
      // Lines that don't match the regex pattern are filtered out, not error-thrown
      const releasesWithInvalidLines =
        "invalid-line-format\n" +
        "62E8BF432F29E8E08240910B85EDBF2D1A41EDF2 atom-0.178.0-full.nupkg 81272434\n" +
        "another-invalid-line\n";
      const releases = await parseRELEASES(releasesWithInvalidLines);
      expect(releases.length).toBe(1); // Only the valid line should be parsed
      expect(releases[0].sha).toBe("62E8BF432F29E8E08240910B85EDBF2D1A41EDF2");
    });

    it("should handle mixed valid and invalid lines correctly", async function () {
      // Test that parsing works correctly with a mix of valid and invalid lines
      const mixedContent =
        "# This is a comment line - invalid\n" +
        "62E8BF432F29E8E08240910B85EDBF2D1A41EDF2 atom-0.178.0-full.nupkg 81272434\n" +
        "invalid format here\n" +
        "5D754139E89802E88984185D2276B54DB730CD5E atom-0.178.1-delta.nupkg 8938535\n" +
        "short line\n";

      const releases = await parseRELEASES(mixedContent);
      expect(releases.length).toBe(2);
      expect(releases[0].filename).toBe("atom-0.178.0-full.nupkg");
      expect(releases[1].filename).toBe("atom-0.178.1-delta.nupkg");
    });

    it("should handle Windows line endings (\\r\\n)", async function () {
      const windowsFormatReleases =
        "62E8BF432F29E8E08240910B85EDBF2D1A41EDF2 atom-0.178.0-full.nupkg 81272434\r\n" +
        "5D754139E89802E88984185D2276B54DB730CD5E atom-0.178.1-delta.nupkg 8938535";
      const releases = await parseRELEASES(windowsFormatReleases);
      expect(releases.length).toBe(2);
      expect(releases[0].sha).toBe("62E8BF432F29E8E08240910B85EDBF2D1A41EDF2");
    });

    it("should filter out empty lines", async function () {
      const releasesWithEmptyLines =
        "62E8BF432F29E8E08240910B85EDBF2D1A41EDF2 atom-0.178.0-full.nupkg 81272434\n" +
        "\n" +
        "5D754139E89802E88984185D2276B54DB730CD5E atom-0.178.1-delta.nupkg 8938535\n" +
        "\n";
      const releases = await parseRELEASES(releasesWithEmptyLines);
      expect(releases.length).toBe(2);
    });

    it("should handle regex capture groups with missing parts", async function () {
      // Test scenario where regex capture groups might be undefined
      // We need to create patterns that pass the main regex but test the || fallbacks

      // Test with a line that matches the basic pattern but might have edge cases
      const edgeCaseRelease =
        "62E8BF432F29E8E08240910B85EDBF2D1A41EDF2 file 12345";
      const releases = await parseRELEASES(edgeCaseRelease);
      expect(releases.length).toBe(1);
      expect(releases[0].filename).toBe("file");
      expect(releases[0].sha).toBe("62E8BF432F29E8E08240910B85EDBF2D1A41EDF2");
      expect(releases[0].size).toBe(12345);
    });

    it("should handle missing optional regex parts by using object manipulation", async function () {
      // Since the regex is strict, we need to test the || fallback logic through
      // manipulation of the exec results. We'll use a spy to simulate missing parts.
      const originalExec = RegExp.prototype.exec;
      let execCallCount = 0;

      vi.spyOn(RegExp.prototype, "exec").mockImplementation(function (
        this: RegExp,
        string: string,
      ) {
        execCallCount++;
        const result = originalExec.call(this, string);
        if (result && execCallCount === 2) {
          // Second call is in the map function
          // Simulate missing optional parts by setting them to undefined
          result[2] = undefined as any; // filename part
          result[1] = undefined as any; // sha part
          result[3] = undefined as any; // size part
        }
        return result;
      });

      const validRelease =
        "62E8BF432F29E8E08240910B85EDBF2D1A41EDF2 atom-0.178.0-full.nupkg 81272434";
      const releases = await parseRELEASES(validRelease);

      expect(releases.length).toBe(1);
      expect(releases[0].filename).toBe(""); // Should use || "" fallback
      expect(releases[0].sha).toBe(""); // Should use || "" fallback
      expect(releases[0].size).toBe(0); // Should use || 0 fallback

      vi.restoreAllMocks();
    });

    it("should handle files without proper version components", async function () {
      // Test files that don't have numeric version components to exercise the filter logic
      const releaseWithoutVersions =
        "62E8BF432F29E8E08240910B85EDBF2D1A41EDF2 app-name-only.nupkg 12345";
      const releases = await parseRELEASES(releaseWithoutVersions);
      expect(releases.length).toBe(1);
      // When no numeric parts are found, version should be empty string
      expect(releases[0].version).toBe("");
      expect(releases[0].filename).toBe("app-name-only.nupkg");
    });
  });

  describe("Version Normalization Edge Cases", function () {
    it("should handle numeric prerelease", function () {
      // Test when prerelease is a number instead of string channel
      expect(normVersion("1.0.0-14")).toBe("1.0.0.14");
      expect(normVersion("2.5.3-99")).toBe("2.5.3.99");
    });

    it("should handle empty prerelease array", function () {
      // This tests the default parameter in hashPrerelease
      expect(normVersion("1.0.0")).toBe("1.0.0");
    });

    it("should handle channel without version number", function () {
      expect(normVersion("1.0.0-alpha")).toBe("1.0.0.1000");
      expect(normVersion("1.0.0-beta")).toBe("1.0.0.2000");
      expect(normVersion("1.0.0-unstable")).toBe("1.0.0.3000");
      expect(normVersion("1.0.0-rc")).toBe("1.0.0.4000");
    });

    it("should handle toSemver with zero prerelease", function () {
      expect(toSemver("1.0.0.0")).toBe("1.0.0");
    });

    it("should handle toSemver with different channel numbers", function () {
      expect(toSemver("1.0.0.3015")).toBe("1.0.0-unstable.15");
      expect(toSemver("1.0.0.4025")).toBe("1.0.0-rc.25");
    });

    it("should handle prerelease with non-string first element", function () {
      // Test the else branch in hashPrerelease when channel is not a string
      // This happens when the prerelease starts with a number
      expect(normVersion("1.0.0-123.something")).toBe("1.0.0.123");
    });

    it("should handle unknown channel names", function () {
      // Test with a channel name not in the CHANNELS array
      expect(normVersion("1.0.0-gamma.5")).toBe("1.0.0.5");
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
        ]),
      ).toBe(
        "62E8BF432F29E8E08240910B85EDBF2D1A41EDF2 atom-1.0.0-full.nupkg 81272434",
      );
    });

    it("should generate delta filename correctly", function () {
      expect(
        generateRELEASES([
          {
            sha: "5D754139E89802E88984185D2276B54DB730CD5E",
            version: "1.0.1",
            app: "myapp",
            size: 8938535,
            isDelta: true,
            filename: "",
            semver: "",
          },
        ]),
      ).toBe(
        "5D754139E89802E88984185D2276B54DB730CD5E myapp-1.0.1-delta.nupkg 8938535",
      );
    });
  });
});
