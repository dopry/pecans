import nock from "nock";
import supertest from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMixedChannelReleaseSet,
  buildStableReleaseSet,
} from "../fixtures/builders";
import { configureTestAppWithReleases } from "../harness";

nock.disableNetConnect();
nock.enableNetConnect(/(localhost|127\.0\.0\.1)/);

const OWNER = process.env.GITHUB_OWNER as string;
const REPO = process.env.GITHUB_REPO as string;

describe("/api/channels", () => {
  afterEach(() => nock.cleanAll());

  it("lists the stable channel with its latest version", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app).get("/api/channels").expect(200);
    expect(res.body).toHaveLength(1);
    const [stable] = res.body;
    expect(stable.name).toBe("stable");
    expect(stable.latest).toBe("2.7.0");
    expect(stable.versions_count).toBe(3);
  });

  it("lists every channel when prereleases exist", async () => {
    const { app } = configureTestAppWithReleases(
      buildMixedChannelReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app).get("/api/channels").expect(200);
    const names = res.body.map((c: { name: string }) => c.name).sort();
    expect(names).toEqual(["beta", "stable"]);
    const beta = res.body.find((c: { name: string }) => c.name === "beta");
    expect(beta.versions_count).toBe(2);
  });
});

describe("/api/versions", () => {
  afterEach(() => nock.cleanAll());

  it("lists all releases sorted by version descending", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app).get("/api/versions").expect(200);
    const versions = res.body.map((r: { version: string }) => r.version);
    expect(versions).toEqual(["2.7.0", "2.6.0", "2.5.0"]);
  });

  it("?channel filters to that channel", async () => {
    const { app } = configureTestAppWithReleases(
      buildMixedChannelReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/api/versions?channel=beta")
      .expect(200);
    const versions = res.body.map((r: { version: string }) => r.version);
    expect(versions).toEqual(["2.8.0-beta.2", "2.8.0-beta.1"]);
  });

  it("?version=latest collapses to the newest release", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/api/versions?version=latest")
      .expect(200);
    const versions = res.body.map((r: { version: string }) => r.version);
    expect(versions).toEqual(["2.7.0"]);
  });

  it("?version=<range> filters by semver range", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/api/versions?version=%3E%3D2.6.0") // >=2.6.0
      .expect(200);
    const versions = res.body.map((r: { version: string }) => r.version);
    expect(versions).toEqual(["2.7.0", "2.6.0"]);
  });

  it("?platform filters to releases with assets for that platform", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/api/versions?platform=osx_64")
      .expect(200);
    expect(res.body).toHaveLength(3);
  });

  it("silently ignores an unknown platform value", async () => {
    // getPlatformFromQuery returns undefined for junk, so no filter applies
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/api/versions?platform=amiga")
      .expect(200);
    expect(res.body).toHaveLength(3);
  });

  it("returns an empty list for an unknown channel", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/api/versions?channel=nightly")
      .expect(200);
    expect(res.body).toEqual([]);
  });
});

describe("/api/status", () => {
  afterEach(() => nock.cleanAll());

  it("reports uptime", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app).get("/api/status").expect(200);
    expect(res.body.uptime).toBeTypeOf("number");
  });
});

describe("/notes", () => {
  afterEach(() => nock.cleanAll());

  it("returns the latest release's notes by default", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/notes")
      .set("Accept", "application/json")
      .expect(200);
    expect(res.body).toEqual({ note: "## 2.7.0\n\nNotes for 2.7.0\n" });
  });

  it("?version returns that release's notes", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/notes?version=2.6.0")
      .set("Accept", "application/json")
      .expect(200);
    expect(res.body).toEqual({ note: "## 2.6.0\n\nNotes for 2.6.0\n" });
  });

  it("serves plain text when json is not requested", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app)
      .get("/notes?version=2.6.0")
      .set("Accept", "text/plain")
      .expect(200);
    expect(res.text).toBe("## 2.6.0\n\nNotes for 2.6.0\n");
  });

  it("404s for an unknown version", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    const res = await supertest(app).get("/notes?version=99.0.0").expect(404);
    expect(res.text).toContain("No release found");
  });
});
