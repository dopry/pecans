import { expect } from "vitest";

/**
 * Contract assertions for the protocols spoken by Electron's built-in
 * autoUpdater. These shapes are consumed by deployed apps and MUST NOT drift.
 */

export interface SquirrelMacUpdate {
  url: string;
  name: string;
  notes: string;
  pub_date: string;
}

/**
 * Squirrel.Mac update response: exactly {url, name, notes, pub_date}, where
 * url points at a zip download and pub_date is ISO 8601.
 */
export function expectSquirrelMacResponse(
  body: unknown
): asserts body is SquirrelMacUpdate {
  expect(body).toBeTypeOf("object");
  const update = body as Record<string, unknown>;
  // exact key set - additive drift breaks nothing but signals contract change,
  // missing keys break Squirrel.Mac clients.
  expect(Object.keys(update).sort()).toEqual([
    "name",
    "notes",
    "pub_date",
    "url",
  ]);
  expect(update.url).toBeTypeOf("string");
  expect(update.name).toBeTypeOf("string");
  expect(update.notes).toBeTypeOf("string");
  expect(update.pub_date).toBeTypeOf("string");
  expect(new Date(update.pub_date as string).toISOString()).toBe(
    update.pub_date
  );
}

const RELEASES_LINE = /^[0-9a-fA-F]{40} \S+ \d+$/;

/**
 * Squirrel.Windows RELEASES contract: LF-separated `<SHA1> <url> <size>`
 * lines, no BOM, no CR, filenames rewritten to absolute /dl/ URLs.
 */
export function expectRELEASESFormat(text: string) {
  expect(text.charCodeAt(0)).not.toBe(0xfeff); // no BOM
  expect(text).not.toContain("\r");
  const lines = text.split("\n");
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines) {
    expect(line).toMatch(RELEASES_LINE);
    const url = line.split(" ")[1];
    expect(url).toMatch(/^https?:\/\/[^/]+(\/.*)?\/dl\/[^/ ]+$/);
  }
}
