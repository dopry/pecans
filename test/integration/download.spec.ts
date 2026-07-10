import nock from "nock";
import supertest from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildFullPlatformAssets,
  buildMixedChannelReleaseSet,
  buildRelease,
  buildStableReleaseSet,
} from "../fixtures/builders";
import {
  configureTestAppWithReleases,
  findAsset,
  USER_AGENTS,
} from "../harness";
import { nockGithubReleasesAssetRedirect } from "../nock/nockGithubReleaseAsset";

nock.disableNetConnect();
nock.enableNetConnect(/(localhost|127\.0\.0\.1)/);

const OWNER = process.env.GITHUB_OWNER as string;
const REPO = process.env.GITHUB_REPO as string;

async function expectRedirectTo(
  app: Parameters<typeof supertest>[0],
  url: string,
  filename: string,
  ua?: string
) {
  let request = supertest(app).get(url);
  if (ua) request = request.set("User-Agent", ua);
  const res = await request.expect(302);
  expect(res.headers.location).toContain(filename);
  return res;
}

describe("GET / (user-agent driven download)", () => {
  afterEach(() => nock.cleanAll());

  it("serves the universal dmg to a mac browser", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO)
    );
    const asset = await findAsset(backend, "2.7.0", "app-2.7.0-univ.dmg");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    await expectRedirectTo(app, "/", "app-2.7.0-univ.dmg", USER_AGENTS.mac);
  });

  it("serves the setup exe to a windows browser", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO)
    );
    const asset = await findAsset(backend, "2.7.0", "app-2.7.0-x64-setup.exe");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    await expectRedirectTo(
      app,
      "/",
      "app-2.7.0-x64-setup.exe",
      USER_AGENTS.windows
    );
  });

  // Linux resolution sorts composite platform ids by string length, so the
  // longer "linux_deb_64" beats "linux_64" and a .deb is served to browsers.
  it("serves the deb to a linux browser", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO)
    );
    const asset = await findAsset(backend, "2.7.0", "app-2.7.0-linux-x64.deb");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    await expectRedirectTo(
      app,
      "/",
      "app-2.7.0-linux-x64.deb",
      USER_AGENTS.linux
    );
  });

  // Today an unresolvable platform throws a plain Error -> 500.
  it("500s when the platform cannot be determined", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO)
    );
    await supertest(app).get("/").set("User-Agent", "curl/8.0").expect(500);
  });
});

describe("/download/:platform?", () => {
  afterEach(() => nock.cleanAll());

  const aliasCases: [string, string][] = [
    // canonical composite ids
    ["osx_64", "app-2.7.0-univ.dmg"], // universal preferred over x64
    ["windows_64", "app-2.7.0-x64-setup.exe"],
    // legacy aliases still used by deployed apps
    ["darwin", "app-2.7.0-univ.dmg"],
    ["mac-arm64", "app-2.7.0-univ.dmg"], // universal preferred over arm64
    ["win-x64", "app-2.7.0-x64-setup.exe"],
  ];

  it.each(aliasCases)(
    "/download/%s redirects to %s",
    async (platform, filename) => {
      const { app, backend } = configureTestAppWithReleases(
        buildStableReleaseSet(OWNER, REPO)
      );
      const asset = await findAsset(backend, "2.7.0", filename);
      nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
      await expectRedirectTo(app, `/download/${platform}`, filename);
    }
  );

  it("serves the platform build when preferUniversal is off", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
      {},
      { preferUniversal: false }
    );
    const asset = await findAsset(backend, "2.7.0", "app-2.7.0-arm64.dmg");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    await expectRedirectTo(app, "/download/mac-arm64", "app-2.7.0-arm64.dmg");
  });

  it("?filetype=zip prefers the zip build", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO)
    );
    const asset = await findAsset(backend, "2.7.0", "app-2.7.0-univ-mac.zip");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    await expectRedirectTo(
      app,
      "/download/osx?filetype=zip",
      "app-2.7.0-univ-mac.zip"
    );
  });

  it("?tag=<version> serves that version", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO)
    );
    const asset = await findAsset(backend, "2.6.0", "app-2.6.0-univ.dmg");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    await expectRedirectTo(
      app,
      "/download/osx?tag=2.6.0",
      "app-2.6.0-univ.dmg"
    );
  });

  it("?tag=latest serves the latest stable release", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildMixedChannelReleaseSet(OWNER, REPO)
    );
    const asset = await findAsset(backend, "2.7.0", "app-2.7.0-univ.dmg");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    await expectRedirectTo(
      app,
      "/download/osx?tag=latest",
      "app-2.7.0-univ.dmg"
    );
  });

  // regression: an absent tag must not widen the channel to "*" - stable
  // users must never be served prereleases (bug fixed in Phase 2)
  it("/download/osx without a tag serves the latest STABLE release", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildMixedChannelReleaseSet(OWNER, REPO)
    );
    const asset = await findAsset(backend, "2.7.0", "app-2.7.0-univ.dmg");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    await expectRedirectTo(app, "/download/osx", "app-2.7.0-univ.dmg");
  });

  it("falls back to any channel when no stable release exists", async () => {
    const beta = ["2.8.0-beta.2", "2.8.0-beta.1"].map((version) =>
      buildRelease({
        owner: OWNER,
        repo: REPO,
        version,
        prerelease: true,
        assets: buildFullPlatformAssets(OWNER, REPO, version),
      })
    );
    const { app, backend } = configureTestAppWithReleases(beta);
    const asset = await findAsset(
      backend,
      "2.8.0-beta.2",
      "app-2.8.0-beta.2-univ.dmg"
    );
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    await expectRedirectTo(app, "/download/osx", "app-2.8.0-beta.2-univ.dmg");
  });

  // README advertises /download/latest but "latest" parses as a platform and
  // 500s. Phase 2 aligns the README with the real route surface.
  it("500s on /download/latest (unsupported route shape)", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO)
    );
    await supertest(app)
      .get("/download/latest")
      .set("User-Agent", USER_AGENTS.mac)
      .expect(500);
  });

  it("500s on an unknown platform", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO)
    );
    await supertest(app).get("/download/amiga").expect(500);
  });

  it("500s when no asset exists for the platform", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO)
    );
    // fixture has no 32-bit windows assets
    await supertest(app).get("/download/win32").expect(500);
  });
});

describe("/download/channel/:channel/:platform?", () => {
  afterEach(() => nock.cleanAll());

  // regression: the :channel path segment must be honored (bug fixed in
  // Phase 2 - it was previously read from the query string only)
  it("/download/channel/stable/osx serves the latest stable release", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildMixedChannelReleaseSet(OWNER, REPO)
    );
    const asset = await findAsset(backend, "2.7.0", "app-2.7.0-univ.dmg");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    await expectRedirectTo(
      app,
      "/download/channel/stable/osx",
      "app-2.7.0-univ.dmg"
    );
  });

  it("serves the latest beta via the beta channel route", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildMixedChannelReleaseSet(OWNER, REPO)
    );
    const asset = await findAsset(
      backend,
      "2.8.0-beta.2",
      "app-2.8.0-beta.2-univ.dmg"
    );
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    await expectRedirectTo(
      app,
      "/download/channel/beta/osx",
      "app-2.8.0-beta.2-univ.dmg"
    );
  });
});

describe("/download/:tag/:filename", () => {
  afterEach(() => nock.cleanAll());

  it("serves a file that belongs to the latest release", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO)
    );
    const asset = await findAsset(backend, "2.7.0", "app-2.7.0-x64.dmg");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    await expectRedirectTo(
      app,
      "/download/2.7.0/app-2.7.0-x64.dmg",
      "app-2.7.0-x64.dmg"
    );
  });

  // regression: the :tag path segment must be honored (bug fixed in Phase 2)
  it("serves a file from an older release by its tag segment", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO)
    );
    const asset = await findAsset(backend, "2.6.0", "app-2.6.0-x64.dmg");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    await expectRedirectTo(
      app,
      "/download/2.6.0/app-2.6.0-x64.dmg",
      "app-2.6.0-x64.dmg"
    );
  });
});

describe("/download/version/:tag/:platform?", () => {
  afterEach(() => nock.cleanAll());

  it("serves the requested platform for the latest version", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO)
    );
    const asset = await findAsset(backend, "2.7.0", "app-2.7.0-univ.dmg");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    await expectRedirectTo(
      app,
      "/download/version/2.7.0/osx",
      "app-2.7.0-univ.dmg"
    );
  });

  // regression: the :tag path segment must be honored (bug fixed in Phase 2)
  it("serves the version named in the path", async () => {
    const { app, backend } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO)
    );
    const asset = await findAsset(backend, "2.6.0", "app-2.6.0-univ.dmg");
    nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
    await expectRedirectTo(
      app,
      "/download/version/2.6.0/osx",
      "app-2.6.0-univ.dmg"
    );
  });

  // regression: this route registers before /download/:tag/:filename so the
  // literal "version" segment is not captured as a tag (bug fixed in Phase 2)
  it(
    "falls back to user-agent detection without a platform segment",
    async () => {
      const { app, backend } = configureTestAppWithReleases(
        buildStableReleaseSet(OWNER, REPO)
      );
      const asset = await findAsset(backend, "2.7.0", "app-2.7.0-univ.dmg");
      nockGithubReleasesAssetRedirect(nock, OWNER, REPO, asset);
      await expectRedirectTo(
        app,
        "/download/version/2.7.0",
        "app-2.7.0-univ.dmg",
        USER_AGENTS.mac
      );
    }
  );
});
