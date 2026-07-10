import nock from "nock";
import supertest from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildFullPlatformAssets,
  buildRelease,
  buildRELEASESContentForVersion,
  buildStableReleaseSet,
  buildMixedChannelReleaseSet,
  fakeSha1,
  SQUIRREL_DELTA_SIZE,
  SQUIRREL_NUPKG_SIZE,
} from "../fixtures/builders";
import { configureTestAppWithReleases, findAsset } from "../harness";
import { expectRELEASESFormat } from "../helpers/contracts";
import { nockGithubAssetContent } from "../nock/nockGithubAssetContent";
import { nockGithubReleasesAssetRedirect } from "../nock/nockGithubReleaseAsset";

nock.disableNetConnect();
nock.enableNetConnect(/(localhost|127\.0\.0\.1)/);

const OWNER = process.env.GITHUB_OWNER as string;
const REPO = process.env.GITHUB_REPO as string;

/**
 * RELEASES is served as application/octet-stream, which superagent buffers
 * as a binary body rather than text.
 */
function bodyText(res: { body: unknown; text?: string }): string {
  if (Buffer.isBuffer(res.body)) return res.body.toString("utf-8");
  return res.text ?? "";
}

// Squirrel.Windows contract (Electron built-in autoUpdater on Windows):
// the RELEASES file of the latest matching release is served with filenames
// rewritten to absolute /dl/ URLs; the client then downloads the nupkgs.
describe("/update/:platform/:version/RELEASES (Squirrel.Windows)", () => {
  afterEach(() => nock.cleanAll());

  async function setupReleasesRequest(
    releases = buildStableReleaseSet(OWNER, REPO),
    latest = "2.7.0",
  ) {
    const { app, backend } = configureTestAppWithReleases(releases);
    const releasesAsset = await findAsset(backend, latest, "RELEASES");
    nockGithubAssetContent(
      nock,
      OWNER,
      REPO,
      releasesAsset,
      buildRELEASESContentForVersion(latest),
    );
    return { app, backend };
  }

  it("serves the latest RELEASES rewritten to /dl/ urls", async () => {
    const { app } = await setupReleasesRequest();
    const res = await supertest(app)
      .get("/update/windows_64/2.5.0/RELEASES")
      .expect(200);

    const text = bodyText(res);
    expectRELEASESFormat(text);

    const lines = text.split("\n");
    expect(lines).toHaveLength(2); // delta + full entries both preserved
    const [deltaLine, fullLine] = lines;

    // sha and size are passed through untouched; filename becomes an
    // absolute URL on the requesting host
    expect(deltaLine).toBe(
      `${fakeSha1("app-2.7.0-x64-delta.nupkg")} ` +
        `${urlOf(res, "app-2.7.0-x64-delta.nupkg")} ${SQUIRREL_DELTA_SIZE}`,
    );
    expect(fullLine).toBe(
      `${fakeSha1("app-2.7.0-x64-full.nupkg")} ` +
        `${urlOf(res, "app-2.7.0-x64-full.nupkg")} ${SQUIRREL_NUPKG_SIZE}`,
    );

    // headers Squirrel.Windows relies on; Content-Length is bytes, so
    // compare against byteLength (equal to .length only for ASCII)
    expect(res.headers["content-length"]).toBe(String(Buffer.byteLength(text)));
    expect(res.headers["content-disposition"]).toContain("RELEASES");
  });

  function urlOf(res: unknown, filename: string) {
    // supertest binds an ephemeral host:port; recover it from the request
    const host = (res as { request: { host: string } }).request.host;
    return `http://${host}/dl/${filename}`;
  }

  it("serves RELEASES via the legacy win-x64 alias", async () => {
    const { app } = await setupReleasesRequest();
    const res = await supertest(app)
      .get("/update/win-x64/2.5.0/RELEASES")
      .expect(200);
    expectRELEASESFormat(bodyText(res));
  });

  it("still serves RELEASES when the client is current", async () => {
    const { app } = await setupReleasesRequest();
    const res = await supertest(app)
      .get("/update/windows_64/2.7.0/RELEASES")
      .expect(200);
    expectRELEASESFormat(bodyText(res));
  });

  it("the rewritten nupkg url downloads via 302", async () => {
    const { app, backend } = await setupReleasesRequest();
    const res = await supertest(app)
      .get("/update/windows_64/2.5.0/RELEASES")
      .expect(200);
    const fullUrl = bodyText(res).split("\n")[1].split(" ")[1];
    const path = new URL(fullUrl).pathname;

    const nupkg = await findAsset(backend, "2.7.0", "app-2.7.0-x64-full.nupkg");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, nupkg);
    const download = await supertest(app).get(path).expect(302);
    expect(download.headers.location).toContain("app-2.7.0-x64-full.nupkg");
  });

  it("serves the channel's RELEASES via the channel route", async () => {
    const { app } = await setupReleasesRequest(
      buildMixedChannelReleaseSet(OWNER, REPO),
      "2.8.0-beta.2",
    );
    const res = await supertest(app)
      .get("/update/channel/beta/windows_64/2.8.0-beta.1/RELEASES")
      .expect(200);
    const text = bodyText(res);
    expectRELEASESFormat(text);
    expect(text).toContain("app-2.8.0-beta.2-x64-full.nupkg");
  });

  it("404s when no release matches the version range", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    // ">=999.0.0" matches nothing -> "Version not found"
    await supertest(app).get("/update/windows_64/999.0.0/RELEASES").expect(404);
  });

  it("404s when the release has no RELEASES asset", async () => {
    const releases = ["2.7.0"].map((version) =>
      buildRelease({
        owner: OWNER,
        repo: REPO,
        version,
        assets: buildFullPlatformAssets(OWNER, REPO, version).filter(
          (a) => a.name !== "RELEASES",
        ),
      }),
    );
    const { app } = configureTestAppWithReleases(releases);
    const res = await supertest(app)
      .get("/update/windows_64/2.5.0/RELEASES")
      .expect(404);
    expect(res.text).toContain("RELEASES File not found");
  });

  // The win32 alias maps to windows_32; the fixture (like most Electron apps
  // today) only publishes x64, so 32-bit clients get a 404. Documented, not
  // endorsed.
  it("404s for win32 clients when only x64 assets exist", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
    );
    await supertest(app).get("/update/win32/2.5.0/RELEASES").expect(404);
  });
});
