import nock from "nock";
import supertest from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAsset,
  buildFullPlatformAssets,
  buildRelease,
  buildStableReleaseSet,
  publishedAtForVersion,
} from "../fixtures/builders.js";
import { configureTestAppWithReleases, findAsset } from "../harness.js";
import { expectSquirrelMacResponse } from "../helpers/contracts.js";
import { nockGithubReleasesAssetRedirect } from "../nock/nockGithubReleaseAsset.js";

nock.disableNetConnect();
nock.enableNetConnect(/(localhost|127\.0\.0\.1)/);

const OWNER = process.env.GITHUB_OWNER as string;
const REPO = process.env.GITHUB_REPO as string;

/** single-arch .msix + multi-arch .msixbundle for a version */
function buildMsixAssets(owner: string, repo: string, version: string) {
  return [
    buildAsset(owner, repo, `app_${version}_x64.msix`),
    buildAsset(owner, repo, `app-${version}.msixbundle`),
  ];
}

/** the stable set with msix assets published alongside the full matrix */
function buildMsixReleaseSet(owner: string, repo: string) {
  return ["2.7.0", "2.6.0", "2.5.0"].map((version) =>
    buildRelease({
      owner,
      repo,
      version,
      assets: [
        ...buildFullPlatformAssets(owner, repo, version),
        ...buildMsixAssets(owner, repo, version),
      ],
    }),
  );
}

/** releases whose only windows assets are .msixbundle (the common MSIX case) */
function buildBundleOnlyReleaseSet(owner: string, repo: string) {
  return ["2.7.0", "2.5.0"].map((version) =>
    buildRelease({
      owner,
      repo,
      version,
      assets: [buildAsset(owner, repo, `app-${version}.msixbundle`)],
    }),
  );
}

// Electron 41+'s autoUpdater for MSIX consumes the same Squirrel.Mac-shaped
// JSON feed ({url, name, notes, pub_date}); following update.electronjs.org
// semantics, the client requests it via the msix format segment
// (/update/:platform/msix/:version). The nuts-era ?filetype query on
// /update was removed in 2.0.
describe("/update/:platform/msix/:version (Electron MSIX)", () => {
  afterEach(() => nock.cleanAll());

  it("200s with a Squirrel.Mac-shaped descriptor when behind", async () => {
    const { app } = configureTestAppWithReleases(
      buildMsixReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/update/win32-x64/msix/2.5.0")
      .expect(200);
    expectSquirrelMacResponse(res.body);
    expect(res.body.name).toBe("2.7.0");
    expect(res.body.url).toMatch(
      /\/download\/version\/2\.7\.0\/windows_64\?filetype=msix$/,
    );
    expect(res.body.pub_date).toBe(publishedAtForVersion("2.7.0"));
  });

  it("204s when the client is on the latest version", async () => {
    const { app } = configureTestAppWithReleases(
      buildMsixReleaseSet(OWNER, REPO),
    );
    await supertest(app).get("/update/win32-x64/msix/2.7.0").expect(204);
  });

  it("204s when no msix assets are published", async () => {
    // the stable set has exe/nupkg windows assets but no msix
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    await supertest(app).get("/update/win32-x64/msix/2.5.0").expect(204);
  });

  it("the update url resolves to the .msixbundle download", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildMsixReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/update/win32-x64/msix/2.5.0")
      .expect(200);
    expectSquirrelMacResponse(res.body);
    const path = new URL(res.body.url).pathname + new URL(res.body.url).search;
    // the bundle is preferred over the single-arch .msix when both exist
    const asset = await findAsset(backend, "2.7.0", "app-2.7.0.msixbundle");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    const download = await supertest(app).get(path).expect(302);
    expect(download.headers.location).toContain(".msixbundle");
  });

  it("accepts the format segment case-insensitively", async () => {
    // the feed url must embed the lowercased filetype or the follow-up
    // download 400s (the download route's validation is case-sensitive)
    const { app } = configureTestAppWithReleases(
      buildMsixReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/update/win32-x64/MSIX/2.5.0")
      .expect(200);
    expectSquirrelMacResponse(res.body);
    expect(res.body.url).toMatch(
      /\/download\/version\/2\.7\.0\/windows_64\?filetype=msix$/,
    );
  });

  it("serves updates from .msixbundle-only releases for arch-specific clients", async () => {
    // a bundle is multi-arch by definition, so it satisfies windows_64
    const { app } = configureTestAppWithReleases(
      buildBundleOnlyReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/update/win32-x64/msix/2.5.0")
      .expect(200);
    expectSquirrelMacResponse(res.body);
    expect(res.body.name).toBe("2.7.0");
  });

  it("default windows updates keep resolving the platform default", async () => {
    // existing squirrel clients keep the zip-filetype feed url even when
    // msix assets are published alongside the exe
    const { app } = configureTestAppWithReleases(
      buildMsixReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app).get("/update/win32-x64/2.5.0").expect(200);
    expectSquirrelMacResponse(res.body);
    expect(res.body.url).toMatch(
      /\/download\/version\/2\.7\.0\/windows_64\?filetype=zip$/,
    );
  });

  it("ignores the removed ?filetype query on /update", async () => {
    // 1.x-era semantics: ?filetype=msix selected the msix feed. 2.0 follows
    // update.electronjs.org and only the format segment selects it; the
    // query is ignored and the standard squirrel feed is served
    const { app } = configureTestAppWithReleases(
      buildMsixReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/update/win32-x64/2.5.0?filetype=msix")
      .expect(200);
    expectSquirrelMacResponse(res.body);
    expect(res.body.url).toMatch(
      /\/download\/version\/2\.7\.0\/windows_64\?filetype=zip$/,
    );
  });
});

describe("/download with msix", () => {
  afterEach(() => nock.cleanAll());

  it("?filetype=msix redirects to the .msixbundle", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildMsixReleaseSet(OWNER, REPO),
    );
    const asset = await findAsset(backend, "2.7.0", "app-2.7.0.msixbundle");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    const res = await supertest(app)
      .get("/download/windows_64?filetype=msix")
      .expect(302);
    expect(res.headers.location).toContain("app-2.7.0.msixbundle");
  });

  it("default windows downloads keep serving the .exe when msix assets exist", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildMsixReleaseSet(OWNER, REPO),
    );
    const asset = await findAsset(backend, "2.7.0", "app-2.7.0-x64-setup.exe");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    const res = await supertest(app).get("/download/windows_64").expect(302);
    expect(res.headers.location).toContain("app-2.7.0-x64-setup.exe");
  });

  it("a stray ?filetype=msix must not break exact-filename downloads", async () => {
    // the filename fully identifies the asset; the filetype->pkg implication
    // only applies when resolving by platform. The stable set has no msix
    // assets, so constraining release resolution to pkg msix would 404 here.
    const { app, backend } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const asset = await findAsset(backend, "2.7.0", "app-2.7.0-x64-setup.exe");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    const res = await supertest(app)
      .get("/download/2.7.0/app-2.7.0-x64-setup.exe?filetype=msix")
      .expect(302);
    expect(res.headers.location).toContain("app-2.7.0-x64-setup.exe");
  });
});

describe("/dl with msix", () => {
  afterEach(() => nock.cleanAll());

  it("/dl/windows/64?pkg=msix redirects to the single-arch .msix", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildMsixReleaseSet(OWNER, REPO),
    );
    const asset = await findAsset(backend, "2.7.0", "app_2.7.0_x64.msix");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    const res = await supertest(app).get("/dl/windows/64?pkg=msix").expect(302);
    expect(res.headers.location).toContain("app_2.7.0_x64.msix");
  });

  it("/dl/windows/universal?pkg=msix redirects to the .msixbundle", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildMsixReleaseSet(OWNER, REPO),
    );
    const asset = await findAsset(backend, "2.7.0", "app-2.7.0.msixbundle");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    const res = await supertest(app)
      .get("/dl/windows/universal?pkg=msix")
      .expect(302);
    expect(res.headers.location).toContain("app-2.7.0.msixbundle");
  });

  it("/dl/app-2.7.0.msixbundle downloads by exact filename", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildMsixReleaseSet(OWNER, REPO),
    );
    const asset = await findAsset(backend, "2.7.0", "app-2.7.0.msixbundle");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    const res = await supertest(app)
      .get("/dl/app-2.7.0.msixbundle")
      .expect(302);
    expect(res.headers.location).toContain("app-2.7.0.msixbundle");
  });
});
