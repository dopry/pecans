import nock from "nock";
import supertest from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildFullPlatformAssets,
  buildMixedChannelReleaseSet,
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

// Squirrel.Mac contract (Electron built-in autoUpdater on macOS):
// 204 = no update; 200 + {url, name, notes, pub_date} = update available.
describe("/update/:platform/:version (Squirrel.Mac)", () => {
  afterEach(() => nock.cleanAll());

  it("204s when the client is on the latest version", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    await supertest(app).get("/update/osx/2.7.0").expect(204);
  });

  // TRUST_PROXY exists for this: behind a TLS-terminating proxy the feed's
  // download url must come out https, which requires express to trust
  // X-Forwarded-Proto (main() wires the env var to app.set("trust proxy"))
  it("emits https download urls when the app trusts the proxy", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    app.set("trust proxy", true);
    const res = await supertest(app)
      .get("/update/osx/2.5.0")
      .set("X-Forwarded-Proto", "https")
      .expect(200);
    expect(res.body.url).toMatch(/^https:\/\//);
  });

  it("keeps http urls when the proxy is not trusted", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/update/osx/2.5.0")
      .set("X-Forwarded-Proto", "https")
      .expect(200);
    expect(res.body.url).toMatch(/^http:\/\//);
    expect(res.body.url).not.toMatch(/^https:\/\//);
  });

  it("204s when the client is ahead of every release", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    await supertest(app).get("/update/osx/999.0.0").expect(204);
  });

  it("200s with the update descriptor when behind", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app).get("/update/osx/2.5.0").expect(200);
    expectSquirrelMacResponse(res.body);
    expect(res.body.name).toBe("2.7.0");
    expect(res.body.url).toMatch(
      /\/download\/version\/2\.7\.0\/osx_64\?filetype=zip$/,
    );
    expect(res.body.pub_date).toBe(publishedAtForVersion("2.7.0"));
    // notes aggregate every version newer than the client, newest first,
    // excluding the client's own version
    expect(res.body.notes).toBe("Notes for 2.7.0\nNotes for 2.6.0\n");
  });

  // the nuts-era ?filetype query on /update was removed in 2.0 in favor of
  // the update.electronjs.org format segment; the query is ignored and the
  // squirrel zip contract always applies (which also means raw req.query
  // values can never be interpolated into the feed url)
  it("ignores the removed ?filetype query", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    for (const query of ["?filetype=dmg", "?filetype=dmg&filetype=exe"]) {
      const res = await supertest(app)
        .get(`/update/osx/2.5.0${query}`)
        .expect(200);
      expect(res.body.url).toMatch(
        /\/download\/version\/2\.7\.0\/osx_64\?filetype=zip$/,
      );
    }
  });

  it("accepts legacy platform aliases like darwin", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app).get("/update/darwin/2.6.0").expect(200);
    expectSquirrelMacResponse(res.body);
    expect(res.body.name).toBe("2.7.0");
  });

  it("the update url resolves to a zip download", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app).get("/update/osx/2.5.0").expect(200);
    expectSquirrelMacResponse(res.body);
    const path = new URL(res.body.url).pathname + new URL(res.body.url).search;
    const asset = await findAsset(backend, "2.7.0", "app-2.7.0-univ-mac.zip");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    const download = await supertest(app).get(path).expect(302);
    expect(download.headers.location).toContain(".zip");
  });

  // regression (#83): the client's release was excluded by position, so a
  // client whose version has no release lost the oldest update's notes
  it("keeps every newer release's notes when the client's version has no release", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app).get("/update/osx/2.4.0").expect(200);
    expectSquirrelMacResponse(res.body);
    expect(res.body.notes).toBe(
      "Notes for 2.7.0\nNotes for 2.6.0\nNotes for 2.5.0\n",
    );
  });

  // the client's version is compared semantically, not by spelling: a
  // leading v or build metadata still identifies its own release
  it.each(["v2.5.0", "2.5.0+build.1"])(
    "excludes the client's own notes when it reports %s",
    async (version) => {
      const { app } = configureTestAppWithReleases(
        buildStableReleaseSet(OWNER, REPO),
      );
      const res = await supertest(app)
        .get(`/update/osx/${encodeURIComponent(version)}`)
        .expect(200);
      expectSquirrelMacResponse(res.body);
      expect(res.body.notes).toBe("Notes for 2.7.0\nNotes for 2.6.0\n");
    },
  );

  it("204s when the client reports the latest version as v2.7.0", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    await supertest(app).get("/update/osx/v2.7.0").expect(204);
  });

  it("ignores prereleases for clients on the stable channel", async () => {
    const { app } = configureTestAppWithReleases(
      buildMixedChannelReleaseSet(OWNER, REPO),
    );
    // 2.8.0-beta.2 exists and is higher, but stable clients stay on 2.7.0
    await supertest(app).get("/update/osx/2.7.0").expect(204);
  });

  it("400s on an unknown platform", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    await supertest(app).get("/update/amiga/2.5.0").expect(400);
  });

  it("400s on an invalid version", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    await supertest(app).get("/update/osx/not-a-version").expect(400);
  });

  it("400s on a range-shaped version", async () => {
    // clients report a specific installed version; a range like >=1.0.0
    // would corrupt the ">=" + version filter and previously 500ed
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    await supertest(app).get("/update/osx/%3E%3D1.0.0").expect(400);
  });
});

describe("/update/channel/:channel/:platform/:version (Squirrel.Mac)", () => {
  afterEach(() => nock.cleanAll());

  it("serves updates from the named channel", async () => {
    const { app } = configureTestAppWithReleases(
      buildMixedChannelReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/update/channel/beta/osx/2.8.0-beta.1")
      .expect(200);
    expectSquirrelMacResponse(res.body);
    expect(res.body.name).toBe("2.8.0-beta.2");
    expect(res.body.url).toMatch(
      /\/download\/version\/2\.8\.0-beta\.2\/osx_64\?filetype=zip$/,
    );
  });

  it("204s when the client is on the latest channel version", async () => {
    const { app } = configureTestAppWithReleases(
      buildMixedChannelReleaseSet(OWNER, REPO),
    );
    await supertest(app)
      .get("/update/channel/beta/osx/2.8.0-beta.2")
      .expect(204);
  });

  // regression (#79): the ">=" + installed-version filter used semver's
  // default prerelease semantics, which only match inside one
  // major.minor.patch tuple, so a beta client never saw the next minor's
  // beta and a stable client polling the beta feed never saw any beta
  describe("across minor bumps", () => {
    const withNextBeta = () => [
      buildRelease({
        owner: OWNER,
        repo: REPO,
        version: "2.9.0-beta.1",
        prerelease: true,
        assets: buildFullPlatformAssets(OWNER, REPO, "2.9.0-beta.1"),
      }),
      ...buildMixedChannelReleaseSet(OWNER, REPO),
    ];

    it("offers the next minor's beta to a beta client", async () => {
      const { app } = configureTestAppWithReleases(withNextBeta());
      const res = await supertest(app)
        .get("/update/channel/beta/osx/2.8.0-beta.2")
        .expect(200);
      expectSquirrelMacResponse(res.body);
      expect(res.body.name).toBe("2.9.0-beta.1");
      expect(res.body.url).toMatch(
        /\/download\/version\/2\.9\.0-beta\.1\/osx_64\?filetype=zip$/,
      );
      // notes cover every beta newer than the client, excluding its own
      expect(res.body.notes).toBe("Notes for 2.9.0-beta.1\n");
    });

    it("offers the current beta to a stable client polling the beta feed", async () => {
      const { app } = configureTestAppWithReleases(
        buildMixedChannelReleaseSet(OWNER, REPO),
      );
      const res = await supertest(app)
        .get("/update/channel/beta/osx/2.7.0")
        .expect(200);
      expectSquirrelMacResponse(res.body);
      expect(res.body.name).toBe("2.8.0-beta.2");
      // the client's own version is not on this channel, so no beta's notes
      // are dropped for it
      expect(res.body.notes).toBe(
        "Notes for 2.8.0-beta.2\nNotes for 2.8.0-beta.1\n",
      );
    });

    it("still keeps stable clients off the betas on the bare feed", async () => {
      const { app } = configureTestAppWithReleases(withNextBeta());
      await supertest(app).get("/update/osx/2.7.0").expect(204);
    });
  });
});

describe("/update (redirect removed in 2.0)", () => {
  afterEach(() => nock.cleanAll());

  // the nuts-era /update?platform=&version= redirect was removed with the
  // rest of the 1.x deprecations; clients use /update/:platform/:version
  it("404s the removed query-style endpoint", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    await supertest(app).get("/update?platform=osx&version=2.5.0").expect(404);
  });
});
