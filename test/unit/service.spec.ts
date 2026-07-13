import { describe, expect, it } from "vitest";
import { Backend } from "../../src/backends/backend";
import { NotFoundError } from "../../src/errors";
import { PecansRelease } from "../../src/models/PecansRelease";
import { PecansReleases } from "../../src/models/PecansReleases";
import {
  assetMatchesPlatform,
  ReleaseService,
  resolveAssetForRelease,
} from "../../src/service";
import { parsePlatform, platformToQuery } from "../../src/utils/platforms";

function asset(filename: string, type: string) {
  return {
    id: `asset-${filename}`,
    filename,
    type: type as never,
    size: 1000,
    content_type: "application/octet-stream",
    raw: {},
  };
}

function release(version: string, assets: ReturnType<typeof asset>[]) {
  return new PecansRelease({
    version,
    channel: "ignored",
    notes: `notes ${version}`,
    published_at: new Date(`2024-01-0${1 + (version.charCodeAt(2) % 8)}`),
    assets,
  });
}

const fullAssets = [
  asset("app-osx-univ.dmg", "osx_universal"),
  asset("app-osx-x64.dmg", "osx_64"),
  asset("app-osx-arm64.dmg", "osx_arm64"),
  asset("app-win-x64.exe", "windows_64"),
  asset("app-win-x64-full.nupkg", "windows_64"),
  asset("RELEASES", "windows_64"),
  asset("app-linux-x64.tar.gz", "linux_64"),
  asset("app-linux-amd64.deb", "linux_deb_64"),
  asset("app-linux-x86_64.rpm", "linux_rpm_64"),
];

class StubBackend extends Backend {
  constructor(protected stubReleases: PecansRelease[]) {
    super();
  }
  async fetchReleases(): Promise<PecansReleases> {
    return new PecansReleases(this.stubReleases);
  }
}

function makeService(releases: PecansRelease[], preferUniversal?: boolean) {
  return new ReleaseService(new StubBackend(releases), { preferUniversal });
}

describe("parsePlatform / platformToQuery", () => {
  it("splits composite ids into discrete parts", () => {
    expect(parsePlatform("linux_deb_64")).toEqual({
      os: "linux",
      arch: "64",
      pkg: "deb",
    });
    expect(parsePlatform("osx_universal")).toEqual({
      os: "osx",
      arch: "universal",
      pkg: undefined,
    });
    expect(parsePlatform("windows")).toEqual({
      os: "windows",
      arch: undefined,
      pkg: undefined,
    });
  });

  it("a bare os id queries any arch and any package format", () => {
    expect(platformToQuery("linux")).toEqual({
      os: "linux",
      arch: undefined,
      pkg: undefined,
    });
  });

  // "linux_deb_64" never matched the "linux_64" prefix in the legacy
  // matcher: an os+arch id means the platform's default package (the
  // tarball), never the deb/rpm alternates
  it("linux os+arch ids query the default package", () => {
    expect(platformToQuery("linux_64")).toEqual({
      os: "linux",
      arch: "64",
      pkg: "default",
    });
  });

  it("osx and windows os+arch ids leave pkg unconstrained", () => {
    expect(platformToQuery("osx_64").pkg).toBeUndefined();
    expect(platformToQuery("windows_64").pkg).toBeUndefined();
  });
});

describe("assetMatchesPlatform", () => {
  it("matches on os alone", () => {
    expect(assetMatchesPlatform("linux_deb_64", { os: "linux" })).toBe(true);
    expect(assetMatchesPlatform("osx_64", { os: "linux" })).toBe(false);
  });

  it("pkg 'default' selects the platform default and rejects alternate formats", () => {
    expect(
      assetMatchesPlatform("linux_64", {
        os: "linux",
        arch: "64",
        pkg: "default",
      }),
    ).toBe(true);
    expect(
      assetMatchesPlatform("linux_deb_64", {
        os: "linux",
        arch: "64",
        pkg: "default",
      }),
    ).toBe(false);
  });

  it("widens an osx arch to universal only with preferUniversal", () => {
    const filter = { os: "osx" as const, arch: "64" as const };
    expect(assetMatchesPlatform("osx_universal", filter)).toBe(false);
    expect(
      assetMatchesPlatform("osx_universal", {
        ...filter,
        preferUniversal: true,
      }),
    ).toBe(true);
    // never widens non-osx queries
    expect(
      assetMatchesPlatform("windows_64", {
        os: "windows",
        arch: "32",
        preferUniversal: true,
      }),
    ).toBe(false);
    // never widens arch-only filters - the filter itself must target osx
    expect(
      assetMatchesPlatform("osx_universal", {
        arch: "arm64",
        preferUniversal: true,
      }),
    ).toBe(false);
  });
});

describe("resolveAssetForRelease", () => {
  const rel = release("1.0.0", fullAssets);

  it("returns the original asset object", () => {
    const resolved = resolveAssetForRelease(rel, { os: "windows" });
    expect(resolved).toBe(rel.assets.find((a) => a.filename.endsWith(".exe")));
  });

  it("prefers the universal build for osx arch queries", () => {
    const resolved = resolveAssetForRelease(rel, {
      os: "osx",
      arch: "64",
      preferUniversal: true,
    });
    expect(resolved?.filename).toBe("app-osx-univ.dmg");
  });

  it("serves the exact arch without preferUniversal", () => {
    const resolved = resolveAssetForRelease(rel, { os: "osx", arch: "64" });
    expect(resolved?.filename).toBe("app-osx-x64.dmg");
  });

  it("ranks the wanted extension first", () => {
    const zipRel = release("1.0.0", [
      asset("app-osx-x64.dmg", "osx_64"),
      asset("app-osx-x64-mac.zip", "osx_64"),
    ]);
    const resolved = resolveAssetForRelease(zipRel, {
      os: "osx",
      arch: "64",
      wanted: ".zip",
    });
    expect(resolved?.filename).toBe("app-osx-x64-mac.zip");
  });

  it("never serves the RELEASES manifest (no supported extension)", () => {
    const winOnly = release("1.0.0", [asset("RELEASES", "windows_64")]);
    expect(
      resolveAssetForRelease(winOnly, { os: "windows", arch: "64" }),
    ).toBeUndefined();
  });
});

describe("ReleaseService", () => {
  const releases = [
    release("2.0.0", fullAssets),
    release("1.5.0", fullAssets),
    release("2.1.0-beta.1", fullAssets),
  ];

  it("filterReleases honors channels", async () => {
    const service = makeService(releases);
    const stable = await service.filterReleases({ channel: "stable" });
    expect(stable.map((r) => r.version)).toEqual(["2.0.0", "1.5.0"]);
    const any = await service.filterReleases({ channel: "*" });
    expect(any).toHaveLength(3);
  });

  it("filterReleases collapses version latest to the newest match", async () => {
    const service = makeService(releases);
    const latest = await service.filterReleases({
      channel: "stable",
      version: "latest",
    });
    expect(latest.map((r) => r.version)).toEqual(["2.0.0"]);
  });

  it("filterReleases returns the full range for semver filters", async () => {
    const service = makeService(releases);
    const matches = await service.filterReleases({
      channel: "stable",
      version: ">=1.0.0",
    });
    expect(matches).toHaveLength(2);
  });

  it("a RELEASES-only release does not count as platform availability", async () => {
    const manifestOnly = [release("1.0.0", [asset("RELEASES", "windows_64")])];
    const service = makeService(manifestOnly);
    const matches = await service.filterReleases({
      channel: "*",
      os: "windows",
    });
    expect(matches).toEqual([]);
  });

  it("filterReleases widens osx availability to universal-only releases", async () => {
    const universalOnly = [
      release("1.0.0", [asset("app-osx-univ.dmg", "osx_universal")]),
    ];
    const service = makeService(universalOnly);
    const widened = await service.filterReleases({
      channel: "*",
      os: "osx",
      arch: "64",
    });
    expect(widened).toHaveLength(1);
    const strict = await service.filterReleases({
      channel: "*",
      os: "osx",
      arch: "64",
      preferUniversal: false,
    });
    expect(strict).toEqual([]);
  });

  it("resolveRelease throws NotFoundError when nothing matches", async () => {
    const service = makeService(releases);
    await expect(
      service.resolveRelease({ channel: "nightly" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("resolveAsset applies the service preferUniversal default", () => {
    const rel = release("1.0.0", fullAssets);
    const preferring = makeService([]);
    expect(
      preferring.resolveAsset(rel, { os: "osx", arch: "64" })?.filename,
    ).toBe("app-osx-univ.dmg");
    const strict = makeService([], false);
    expect(strict.resolveAsset(rel, { os: "osx", arch: "64" })?.filename).toBe(
      "app-osx-x64.dmg",
    );
  });

  it("resolveAsset falls back to the default for an explicit preferUniversal: undefined", () => {
    const rel = release("1.0.0", fullAssets);
    const service = makeService([]);
    const resolved = service.resolveAsset(rel, {
      os: "osx",
      arch: "64",
      preferUniversal: undefined,
    });
    expect(resolved?.filename).toBe("app-osx-univ.dmg");
  });

  it("filterReleases enforces arch/pkg constraints without an os", async () => {
    const x64Only = [
      release("1.0.0", [asset("app-linux-x64.tar.gz", "linux_64")]),
    ];
    const service = makeService(x64Only);
    const arm = await service.filterReleases({ channel: "*", arch: "arm64" });
    expect(arm).toEqual([]);
    const deb = await service.filterReleases({ channel: "*", pkg: "deb" });
    expect(deb).toEqual([]);
    const unpackaged = await service.filterReleases({
      channel: "*",
      pkg: "default",
    });
    expect(unpackaged).toHaveLength(1);
  });
});
