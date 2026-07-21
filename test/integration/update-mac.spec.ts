import nock from "nock";
import supertest from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMixedChannelReleaseSet,
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

  it("honors an explicit ?filetype override in the feed url", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/update/osx/2.5.0?filetype=dmg")
      .expect(200);
    expect(res.body.url).toMatch(
      /\/download\/version\/2\.7\.0\/osx_64\?filetype=dmg$/,
    );
  });

  // regression: raw req.query values must never be interpolated into the
  // feed url - repeated params (arrays) fall back to the default filetype
  it("falls back to filetype=zip for repeated ?filetype params", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/update/osx/2.5.0?filetype=dmg&filetype=exe")
      .expect(200);
    expect(res.body.url).toMatch(
      /\/download\/version\/2\.7\.0\/osx_64\?filetype=zip$/,
    );
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
});

describe("/update (deprecated redirect)", () => {
  afterEach(() => nock.cleanAll());

  it("redirects to /update/:platform/:version", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/update?platform=osx&version=2.5.0")
      .expect(302);
    expect(res.headers.location).toBe("/update/osx/2.5.0");
  });

  it("400s when version or platform is missing", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    await supertest(app).get("/update?platform=osx").expect(400);
    await supertest(app).get("/update?version=2.5.0").expect(400);
  });

  // regression: repeated params parse as arrays and must 400 rather than
  // producing a malformed redirect path like /update/osx,win/1.0.0
  it("400s on repeated query params", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    await supertest(app)
      .get("/update?platform=osx&platform=win&version=2.5.0")
      .expect(400);
    await supertest(app)
      .get("/update?platform=osx&version=2.5.0&version=2.6.0")
      .expect(400);
  });

  it("encodes the platform and version into the redirect path", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/update?platform=osx%2F..&version=2.5.0")
      .expect(302);
    expect(res.headers.location).toBe("/update/osx%2F../2.5.0");
  });
});
