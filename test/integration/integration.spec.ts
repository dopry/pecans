import express from "express";
import { describe, it, expect, afterEach } from "vitest";
import nock from "nock";
import supertest from "supertest";
import { Pecans, PecansGitHubBackend } from "../../src";
import {
  mockTypicalReleases,
  nockGithubListReleases,
  nockGithubListReleasesPaginated,
} from "../nock/nockGithubListReleases";
import { nockGithubReleasesAssetRedirect } from "../nock/nockGithubReleaseAsset";

// nock.recorder.rec();
nock.disableNetConnect();
// Allow localhost connections so we can test local routes and mock servers.
nock.enableNetConnect(/(localhost|127\.0\.0\.1)/);

function configurePecansGitHubBackend() {
  const env = PecansGitHubBackend.getEnvironment();
  const backend = PecansGitHubBackend.FromEnv(env);
  return { env, backend };
}

function configurePecansTestApp(backend: PecansGitHubBackend) {
  const pecans = new Pecans(backend);
  const app = express();
  app.use(pecans.router);
  return { pecans, app };
}

// function testDownload(os: OperatingSystem, arch: Architecture): void {
//   it("version defaults to latest and channel defaults to stable", async () => {
//     const { env, backend } = configurePecansGitHubBackend();
//     nockGithubListReleases(nock, env.GITHUB_OWNER, env.GITHUB_REPO);
//     const { app } = configurePecansTestApp(backend);
//     const response = await supertest(app).get(`/dl/${os}/${arch}`).expect(302);
//     // test against latest known version. This will need to be changed to match the mock data.
//     assert.match(response.header.location, /2\.7\.0/);
//   });

//   describe("version query", () => {
//     it("given a version, when that version exists, it returns that version", async () => {});
//     it("given a version, when that version does not exist, it returns a 404", async () => {});
//   });

//   describe("channel query", () => {
//     it("is not currently supported, it might or might not work.", async () => {});
//   });
// }

describe("Integration Tests: Github Backend", () => {
  afterEach(() => {
    nock.cleanAll();
  });

  // TODO: Implement tests for deprecated endpoints when needed
  // describe("deprecated endpoints", () => {
  //   describe("/download/:platform?", () => {});
  //   describe("/update/:platform/:version", () => {});
  //   describe("/update/:platform/:version/RELEASES", () => {});
  // });

  // Regression test for the node-fetch@2 override bug: octokit.paginate() must
  // walk every page (via the `Link: rel="next"` header) and return the union of
  // all releases. With node-fetch@2 hard-wired into octokit, paginate() silently
  // resolved to an empty/partial list for large, multi-page responses (observed
  // on DigitalOcean App Platform with ~390 releases), breaking release listing.
  describe("fetchReleases pagination", () => {
    it("follows Link headers and concatenates every page", async () => {
      const { env, backend } = configurePecansGitHubBackend();
      const { GITHUB_OWNER: owner, GITHUB_REPO: repo } = env;

      const page1 = mockTypicalReleases(owner, repo, ["3.0.0", "2.9.0"]);
      const page2 = mockTypicalReleases(owner, repo, ["2.8.0", "2.7.0"]);
      const page3 = mockTypicalReleases(owner, repo, ["2.6.0"]);
      nockGithubListReleasesPaginated(nock, owner, repo, [page1, page2, page3]);

      const releases = await backend.fetchReleases();
      const versions = releases.getReleases().map((r) => r.version);

      // All five releases across the three pages must be present — not just the
      // first page (the failure mode the node-fetch override caused).
      expect(versions).toHaveLength(5);
      expect(versions).toEqual(
        expect.arrayContaining(["3.0.0", "2.9.0", "2.8.0", "2.7.0", "2.6.0"])
      );
      expect(nock.isDone()).toBe(true);
    });
  });

  // TODO: Implement webhook refresh tests
  // describe("/webhook/refresh", () => {});
  describe("/dl/:filename", () => {
    it("requires filename", async () => {
      const { env, backend } = configurePecansGitHubBackend();
      nockGithubListReleases(nock, env.GITHUB_OWNER, env.GITHUB_REPO);
      const { app } = configurePecansTestApp(backend);
      await supertest(app).get("/dl/").expect(404);
    });
    it("return a file", async () => {
      const { env, backend } = configurePecansGitHubBackend();
      const { GITHUB_OWNER: owner, GITHUB_REPO: repo } = env;
      const mock_releases = mockTypicalReleases(owner, repo);
      nockGithubListReleases(nock, owner, repo, mock_releases);
      const { app } = configurePecansTestApp(backend);
      nockGithubListReleases(nock, owner, repo, mock_releases);
      const releases = await backend.releases();
      const release = releases.getReleases()[0];
      const asset = release.assets[2];
      const filename = asset.filename;
      nockGithubReleasesAssetRedirect(nock, owner, repo, asset);
      const url = `/dl/${filename}`;
      const request = supertest(app).get(url).expect(302);
      const reponse = await request;
      expect(reponse.headers.location).toMatch(new RegExp(`${filename}`));
    });
  });
  // TODO: Implement tests for OS/arch specific downloads
  // describe("/dl/:os/:arch", () => {
  //   describe("/dl/windows/x64", () => {});
  //   describe("/dl/osx/x64", () => {});
  //   describe("/dl/osx/arm64", () => {});
  //   describe("/dl/osx/universal", () => {});
  //   describe("/dl/linux/x64", () => {});
  //   describe("/dl/linux/arm64", () => {});
  // });

  // TODO: Implement API endpoint tests
  // describe("/api", () => {
  //   describe("/api/channels", () => {});
  //   describe("/api/versions", () => {});
  // });

  // TODO: Implement notes endpoint tests
  // describe("/notes/:version?", () => {});
});
