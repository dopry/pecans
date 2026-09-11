import { stripBom } from "./stripBOM.js";
import { versionFromFilename } from "./versionFromFilename.js";

// RELEASES parsing
const releaseRe = /^([0-9a-fA-F]{40})\s+(\S+)\s+(\d+)[\r]*$/;

export interface SquirrelRelease {
  app?: string;
  sha: string;
  filename: string;
  size: number;
  isDelta: boolean;
  version: string;
  /** undefined when the filename carries no release version */
  semver?: string;
}

// Parse RELEASES file
// https://github.com/Squirrel/Squirrel.Windows/blob/0d1250aa6f0c25fe22e92add78af327d1277d97d/src/Squirrel/ReleaseExtensions.cs#L19
export async function parseRELEASES(
  content: string,
): Promise<SquirrelRelease[]> {
  const stripped = stripBom(content);
  // String#replace with a string pattern would only replace the first
  // CRLF; replaceAll normalizes every CRLF occurrence
  const normalizedEOL = stripped.replaceAll("\r\n", "\n");
  const lines = normalizedEOL.split("\n");
  const goodlines = lines.filter((line) => !!releaseRe.exec(line));

  return goodlines.map((line) => {
    const parts = releaseRe.exec(line)!; // Non-null assertion since goodlines are pre-filtered
    const filename = parts[2] || "";
    const isDelta = filename.indexOf("-full.nupkg") == -1;
    const filenameParts = filename
      .replace(".nupkg", "")
      .replace("-delta", "")
      .replace("-full", "")
      .split(/\.|-/)
      .reverse();

    const version = filenameParts
      .filter(function (x) {
        return /^\d+$/.exec(x);
      })
      .reverse()
      .join(".");
    const sha = parts[1] || "";
    const size = Number(parts[3] || 0);
    // the filename carries the release version verbatim; the four-part
    // build number above cannot name a channel it does not encode
    const semver = versionFromFilename(filename);

    return {
      // TODO: This should probably have a value.
      app: undefined,
      sha,
      filename,
      size,
      isDelta,
      version,
      semver,
    };
  });
}

// Generate a RELEASES file
export function generateRELEASES(entries: SquirrelRelease[]) {
  return entries
    .map((entry) => {
      let filename = entry.filename;

      if (!filename) {
        filename = [
          entry.app,
          entry.version,
          entry.isDelta ? "delta.nupkg" : "full.nupkg",
        ].join("-");
      }

      return [entry.sha, filename, entry.size].join(" ");
    })
    .join("\n");
}
