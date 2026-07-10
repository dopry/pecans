import { describe, expect, it } from "vitest";
import { parseUserAgent } from "../../src/utils/userAgent";

const UA = {
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  linux64:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  linux32:
    "Mozilla/5.0 (X11; Linux i686; rv:109.0) Gecko/20100101 Firefox/115.0",
  ios: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  curl: "curl/8.5.0",
};

describe("parseUserAgent", () => {
  it("detects macOS", () => {
    const details = parseUserAgent(UA.mac);
    expect(details.isMac).toBe(true);
    expect(details.isWindows).toBe(false);
    expect(details.isLinux).toBe(false);
  });

  it("detects Windows", () => {
    const details = parseUserAgent(UA.windows);
    expect(details.isWindows).toBe(true);
    expect(details.isMac).toBe(false);
    expect(details.isLinux).toBe(false);
  });

  it("detects 64-bit Linux", () => {
    const details = parseUserAgent(UA.linux64);
    expect(details.isLinux).toBe(true);
    expect(details.isLinux64).toBe(true);
  });

  it("detects 32-bit Linux without the 64-bit flag", () => {
    const details = parseUserAgent(UA.linux32);
    expect(details.isLinux).toBe(true);
    expect(details.isLinux64).toBe(false);
  });

  it("does not flag iOS as macOS despite 'like Mac OS X'", () => {
    const details = parseUserAgent(UA.ios);
    expect(details.isMac).toBe(false);
  });

  it("does not flag Android as Linux despite 'Linux' in the UA", () => {
    const details = parseUserAgent(UA.android);
    expect(details.isLinux).toBe(false);
  });

  it("returns all-false for non-browser agents and empty input", () => {
    for (const source of [UA.curl, "", undefined]) {
      const details = parseUserAgent(source);
      expect(details.isMac).toBe(false);
      expect(details.isWindows).toBe(false);
      expect(details.isLinux).toBe(false);
      expect(details.isLinux64).toBe(false);
    }
  });

  it("preserves the raw source", () => {
    expect(parseUserAgent(UA.curl).source).toBe(UA.curl);
  });
});
