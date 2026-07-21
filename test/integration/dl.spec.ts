import nock from "nock";
import supertest from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMixedChannelReleaseSet,
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
    const res = await supertest(app).get("/dl/linux/arm64").expect(404);
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
