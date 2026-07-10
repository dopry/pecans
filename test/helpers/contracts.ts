import { expect } from "vitest";

/**
 * Contract assertions for the protocols spoken by Electron's built-in
 * autoUpdater. These shapes are consumed by deployed apps and MUST NOT drift.
 *
 * Provenance: originally derived from pecans' handleUpdateOSX/handleUpdateWin
 * output, then verified against the consumers:
 * - Squirrel.Mac README, "Update JSON Format": only `url` is REQUIRED;
 *   `name`, `notes`, `pub_date` are optional; `pub_date` must be ISO 8601
 *   when present; 200 = update available, 204 = none; `url` must serve a ZIP
 *   (fetched with `Accept: application/zip`).
 *   https://github.com/Squirrel/Squirrel.Mac#update-json-format
 * - Squirrel.Windows ReleaseEntry.cs: RELEASES lines parse with
 *   `^([0-9a-fA-F]{40})\s+(\S+)\s+(\d+)[\r]*$` (SHA1 case-insensitive);
 *   absolute HTTP(S) URLs in the filename field are explicitly supported
 *   (Utility.IsHttpUrl); delta packages end with `-delta.nupkg`.
 *   https://github.com/Squirrel/Squirrel.Windows/blob/develop/src/Squirrel/ReleaseEntry.cs
 */

export interface SquirrelMacUpdate {
  url: string;
  name: string;
  notes: string;
  pub_date: string;
}

/**
 * Squirrel.Mac update response.
 *
 * The client contract requires only a well-formed `url` (and ISO 8601
 * `pub_date` when present). The exact-key-set check below is a stricter pin
 * on pecans' own output, to detect drift in what we emit - not a client
 * requirement.
 */
export function expectSquirrelMacResponse(
  body: unknown
): asserts body is SquirrelMacUpdate {
  // explicit null guard: typeof null is also "object"
  expect(body).not.toBeNull();
  expect(body).toBeTypeOf("object");
  const update = body as Record<string, unknown>;

  // client-required: url must be present and well-formed
  expect(update.url).toBeTypeOf("string");
  expect(() => new URL(update.url as string)).not.toThrow();

  // client-required when present: ISO 8601 pub_date
  expect(update.pub_date).toBeTypeOf("string");
  expect(new Date(update.pub_date as string).toISOString()).toBe(
    update.pub_date
  );

  // pecans-output pin: we always emit exactly these four keys
  expect(Object.keys(update).sort()).toEqual([
    "name",
    "notes",
    "pub_date",
    "url",
  ]);
  expect(update.name).toBeTypeOf("string");
  expect(update.notes).toBeTypeOf("string");
}

// Exact parse regex from Squirrel.Windows ReleaseEntry.cs (sans trailing
// [\r]*, which we forbid outright below).
const SQUIRREL_WINDOWS_LINE = /^([0-9a-fA-F]{40})\s+(\S+)\s+(\d+)$/;

// pecans-output pin: we emit single-space separators (consumer accepts \s+)
const PECANS_LINE = /^[0-9a-fA-F]{40} \S+ \d+$/;

/**
 * Squirrel.Windows RELEASES contract: LF-separated `<SHA1> <url> <size>`
 * lines, no BOM, no CR, filenames rewritten to absolute /dl/ URLs (absolute
 * URLs are supported by the client's parser).
 */
export function expectRELEASESFormat(text: string) {
  expect(text.charCodeAt(0)).not.toBe(0xfeff); // no BOM
  expect(text).not.toContain("\r");
  const lines = text.split("\n");
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    // must parse with the consumer's own regex...
    expect(line).toMatch(SQUIRREL_WINDOWS_LINE);
    // ...and match the tighter format pecans emits
    expect(line).toMatch(PECANS_LINE);
    const url = line.split(" ")[1];
    expect(url).toMatch(/^https?:\/\/[^/]+(\/.*)?\/dl\/[^/ ]+$/);
  }
}
