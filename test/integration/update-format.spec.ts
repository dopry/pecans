import nock from "nock";
import supertest from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAsset,
  buildFullPlatformAssets,
  buildRelease,
  buildRELEASESContentForVersion,
  buildStableReleaseSet,
} from "../fixtures/builders.js";
import { configureTestAppWithReleases, findAsset } from "../harness.js";
import { expectSquirrelMacResponse } from "../helpers/contracts.js";
import { nockGithubAssetContent } from "../nock/nockGithubAssetContent.js";

nock.disableNetConnect();
nock.enableNetConnect(/(localhost|127\.0\.0\.1)/);

const OWNER = process.env.GITHUB_OWNER as string;
const REPO = process.env.GITHUB_REPO as string;

/** the stable set with msix assets published alongside the full matrix */
function buildMsixReleaseSet(owner: string, repo: string) {
  return ["2.7.0", "2.6.0", "2.5.0"].map((version) =>
    buildRelease({
      owner,
      repo,
      version,
      assets: [
        ...buildFullPlatformAssets(owner, repo, version),
        buildAsset(owner, repo, `app_${version}_x64.msix`),
      ],
    }),
  );
}

// update.electronjs.org-compatible surface: platform-arch ids
// ("darwin-x64", "win32-x64") on the existing routes, plus the
// /update/:platform/:format/:version segment where format is
// squirrel (default protocols) or msix (Electron 39.5+/40.2+/41+).
describe("/update/:platform/:format/:version (update.electronjs.org compat)", () => {
  afterEach(() => nock.cleanAll());

  it("squirrel serves the Squirrel.Mac-shaped feed", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/update/darwin-x64/squirrel/2.5.0")
      .expect(200);
    expectSquirrelMacResponse(res.body);
    expect(res.body.name).toBe("2.7.0");
    expect(res.body.url).toMatch(
      /\/download\/version\/2\.7\.0\/osx_64\?filetype=zip$/,
    );
  });

  it("msix serves the feed constrained to msix assets", async () => {
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
  });

  it("msix 204s when no msix assets exist", async () => {
    // the stable set has windows assets but no msix packages
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    await supertest(app).get("/update/win32-x64/msix/2.5.0").expect(204);
  });

  it("squirrel 204s when the client is current", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    await supertest(app).get("/update/darwin-x64/squirrel/2.7.0").expect(204);
  });

  it("404s an unknown format", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/update/darwin-x64/appx/2.5.0")
      .expect(404);
    expect(res.text).toContain("Unsupported update format");
  });

  it("keeps the literal RELEASES tail on the Squirrel.Windows route", async () => {
    // /update/:platform/:version/RELEASES must not be captured by the
    // format route (version read as :format)
    const { app, backend } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const releasesAsset = await findAsset(backend, "2.7.0", "RELEASES");
    nockGithubAssetContent(
      nock,
      OWNER,
      REPO,
      releasesAsset,
      buildRELEASESContentForVersion("2.7.0"),
    );
    await supertest(app).get("/update/win32-x64/2.5.0/RELEASES").expect(200);
  });
});

describe("/update/:platform/:format/:version/RELEASES", () => {
  afterEach(() => nock.cleanAll());

  it("squirrel serves the rewritten RELEASES manifest", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const releasesAsset = await findAsset(backend, "2.7.0", "RELEASES");
    nockGithubAssetContent(
      nock,
      OWNER,
      REPO,
      releasesAsset,
      buildRELEASESContentForVersion("2.7.0"),
    );
    const res = await supertest(app)
      .get("/update/win32-x64/squirrel/2.5.0/RELEASES")
      .expect(200);
    const body = Buffer.isBuffer(res.body)
      ? res.body.toString("utf-8")
      : (res.text ?? "");
    expect(body).toContain("/dl/");
  });

  it("404s msix (no RELEASES manifest exists for MSIX)", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/update/win32-x64/msix/2.5.0/RELEASES")
      .expect(404);
    expect(res.text).toContain("Unsupported update format");
  });
});

describe("update.electronjs.org platform-arch aliases", () => {
  afterEach(() => nock.cleanAll());

  it("serves darwin-universal via the standard route", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/update/darwin-universal/2.5.0")
      .expect(200);
    expectSquirrelMacResponse(res.body);
    expect(res.body.url).toMatch(/osx_universal\?filetype=zip$/);
  });
});
