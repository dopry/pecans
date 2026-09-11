import nock from "nock";
import supertest from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAsset,
  buildFullPlatformAssets,
  buildMixedChannelReleaseSet,
  buildRelease,
  buildStableReleaseSet,
} from "../fixtures/builders.js";
import { configureTestAppWithReleases, findAsset } from "../harness.js";
import { nockGithubReleasesAssetRedirect } from "../nock/nockGithubReleaseAsset.js";

nock.disableNetConnect();
nock.enableNetConnect(/(localhost|127\.0\.0\.1)/);

const OWNER = process.env.GITHUB_OWNER as string;
const REPO = process.env.GITHUB_REPO as string;

describe("/dl/:os/:arch", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  // Table of happy paths: os/arch (+query) -> expected asset of the latest
  // stable release (2.7.0).
  const cases: [string, string][] = [
    ["/dl/osx/64", "app-2.7.0-x64.dmg"],
    ["/dl/osx/arm64", "app-2.7.0-arm64.dmg"],
    ["/dl/osx/universal", "app-2.7.0-univ.dmg"],
    ["/dl/windows/64", "app-2.7.0-x64-setup.exe"],
    ["/dl/linux/64", "app-2.7.0-linux-x64.tar.gz"],
    ["/dl/linux/64?pkg=deb", "app-2.7.0-linux-x64.deb"],
    ["/dl/linux/64?pkg=rpm", "app-2.7.0-linux-x64.rpm"],
  ];

  it.each(cases)("%s redirects to %s", async (url, filename) => {
    const { app, backend } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const asset = await findAsset(backend, "2.7.0", filename);
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    const res = await supertest(app).get(url).expect(302);
    expect(res.headers.location).toContain(filename);
  });

  it("serves windows and linux arm64 assets", async () => {
    // arm64 assets alongside the standard fixture set; previously these
    // were dropped at ingestion (no windows_arm64/linux_arm64 platforms)
    const version = "3.0.0";
    const release = buildRelease({
      owner: OWNER,
      repo: REPO,
      version,
      assets: [
        ...buildFullPlatformAssets(OWNER, REPO, version),
        buildAsset(OWNER, REPO, `app-${version}-win32-arm64-setup.exe`),
        buildAsset(OWNER, REPO, `app-${version}-linux-arm64.tar.gz`),
      ],
    });
    const { app, backend } = configureTestAppWithReleases([release]);

    for (const [url, filename] of [
      ["/dl/windows/arm64", `app-${version}-win32-arm64-setup.exe`],
      ["/dl/linux/arm64", `app-${version}-linux-arm64.tar.gz`],
      // the x64 defaults keep resolving despite the arm64 assets
      ["/dl/windows/64", `app-${version}-x64-setup.exe`],
    ] as const) {
      const asset = await findAsset(backend, version, filename);
      nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
      const res = await supertest(app).get(url).expect(302);
      expect(res.headers.location).toContain(filename);
    }
  });

  it("?version selects an older release", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const asset = await findAsset(backend, "2.6.0", "app-2.6.0-x64.dmg");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    const res = await supertest(app)
      .get("/dl/osx/64?version=2.6.0")
      .expect(302);
    expect(res.headers.location).toContain("app-2.6.0-x64.dmg");
  });

  it("?channel=beta selects the latest beta release", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildMixedChannelReleaseSet(OWNER, REPO),
    );
    const asset = await findAsset(
      backend,
      "2.8.0-beta.2",
      "app-2.8.0-beta.2-x64.dmg",
    );
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    const res = await supertest(app).get("/dl/osx/64?channel=beta").expect(302);
    expect(res.headers.location).toContain("app-2.8.0-beta.2-x64.dmg");
  });

  // regression (#79): a range on a prerelease channel must match that
  // channel's builds across minor bumps
  it("?channel=beta&version=<range> matches betas across tuples", async () => {
    const releases = [
      buildRelease({
        owner: OWNER,
        repo: REPO,
        version: "2.9.0-beta.1",
        prerelease: true,
        assets: buildFullPlatformAssets(OWNER, REPO, "2.9.0-beta.1"),
      }),
      ...buildMixedChannelReleaseSet(OWNER, REPO),
    ];
    const { app, backend } = configureTestAppWithReleases(releases);
    const asset = await findAsset(
      backend,
      "2.9.0-beta.1",
      "app-2.9.0-beta.1-x64.dmg",
    );
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    const res = await supertest(app)
      .get("/dl/osx/64?channel=beta&version=%3E%3D2.8.0-beta.2") // >=2.8.0-beta.2
      .expect(302);
    expect(res.headers.location).toContain("app-2.9.0-beta.1-x64.dmg");
  });

  // regression (#88): "*" names every channel rather than one, so it has
  // nothing to look up and was rejected as an unknown channel name
  it("?channel=* selects the highest version on any channel", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildMixedChannelReleaseSet(OWNER, REPO),
    );
    const asset = await findAsset(
      backend,
      "2.8.0-beta.2",
      "app-2.8.0-beta.2-x64.dmg",
    );
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    const res = await supertest(app).get("/dl/osx/64?channel=%2A").expect(302);
    expect(res.headers.location).toContain("app-2.8.0-beta.2-x64.dmg");
  });

  it("defaults to the stable channel when prereleases exist", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildMixedChannelReleaseSet(OWNER, REPO),
    );
    const asset = await findAsset(backend, "2.7.0", "app-2.7.0-x64.dmg");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    const res = await supertest(app).get("/dl/osx/64").expect(302);
    expect(res.headers.location).toContain("app-2.7.0-x64.dmg");
  });

  it("404s on an unrecognized os", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app).get("/dl/freebsd/64").expect(404);
    expect(res.text).toContain("Unrecognized OS");
  });

  it("404s on an unsupported arch for the os", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    // linux has no universal builds (arm64 became a valid linux arch in 2.0)
    const res = await supertest(app).get("/dl/linux/universal").expect(404);
    expect(res.text).toContain("Unsupported Arch");
  });

  it("404s when no release matches the version", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/dl/osx/64?version=99.0.0")
      .expect(404);
    expect(res.text).toContain("No Matching Releases Found");
  });

  it("404s when no asset matches the os/arch", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    // windows 32-bit assets are not part of the fixture
    await supertest(app).get("/dl/windows/32").expect(404);
  });

  it("404s on an unknown channel", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/dl/osx/64?channel=nightly")
      .expect(404);
    expect(res.text).toContain("Invalid Channel");
  });
});

describe("/dl/:filename", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it("redirects to the asset with that filename", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const asset = await findAsset(backend, "2.6.0", "app-2.6.0-x64-full.nupkg");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    const res = await supertest(app)
      .get("/dl/app-2.6.0-x64-full.nupkg")
      .expect(302);
    expect(res.headers.location).toContain("app-2.6.0-x64-full.nupkg");
  });

  it("404s for a filename that matches no asset", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app).get("/dl/no-such-file.dmg").expect(404);
    expect(res.text).toContain("not found");
  });
});
