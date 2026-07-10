import { Webhooks } from "@octokit/webhooks";
import nock from "nock";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildStableReleaseSet, buildRelease, buildFullPlatformAssets } from "../fixtures/builders";
import { configureTestAppWithReleases } from "../harness";
import { nockGithubListReleases } from "../nock/nockGithubListReleases";

nock.disableNetConnect();
nock.enableNetConnect(/(localhost|127\.0\.0\.1)/);

const OWNER = process.env.GITHUB_OWNER as string;
const REPO = process.env.GITHUB_REPO as string;
const SECRET = "webhook-test-secret";

async function signedReleaseEvent(secret: string) {
  const payload = JSON.stringify({
    action: "published",
    release: { id: 1, tag_name: "v2.8.0" },
    repository: { full_name: `${OWNER}/${REPO}` },
  });
  const webhooks = new Webhooks({ secret });
  const signature = await webhooks.sign(payload);
  return { payload, signature };
}

describe("/webhook/refresh (GitHub release webhook)", () => {
  afterEach(() => nock.cleanAll());

  it("busts the release cache on a signed release event", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
      { refreshSecret: SECRET }
    );

    // warm the cache with the initial release list
    const before = await supertest(app).get("/api/versions").expect(200);
    expect(before.body).toHaveLength(3);

    // the refresh triggered by the webhook fetches this updated list
    const updated = [
      buildRelease({
        owner: OWNER,
        repo: REPO,
        version: "2.8.0",
        assets: buildFullPlatformAssets(OWNER, REPO, "2.8.0"),
      }),
      ...buildStableReleaseSet(OWNER, REPO),
    ];
    nockGithubListReleases(nock, OWNER, REPO, updated);

    const { payload, signature } = await signedReleaseEvent(SECRET);
    await supertest(app)
      .post("/webhook/refresh")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "release")
      .set("X-GitHub-Delivery", "test-delivery-1")
      .set("X-Hub-Signature-256", signature)
      .send(payload)
      .expect(200);

    // the handler fires refreshCache without awaiting it; poll until the
    // refreshed list lands
    await vi.waitFor(async () => {
      const after = await supertest(app).get("/api/versions").expect(200);
      expect(after.body).toHaveLength(4);
      expect(after.body[0].version).toBe("2.8.0");
    });
  });

  it("rejects a bad signature", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO),
      { refreshSecret: SECRET }
    );
    const { payload } = await signedReleaseEvent(SECRET);
    const res = await supertest(app)
      .post("/webhook/refresh")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "release")
      .set("X-GitHub-Delivery", "test-delivery-2")
      .set("X-Hub-Signature-256", "sha256=0000000000000000")
      .send(payload);
    // a 4xx rejection specifically - a crashing handler (5xx) must not pass
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("is a no-op 404 when no refreshSecret is configured", async () => {
    const { app } = configureTestAppWithReleases(
      buildStableReleaseSet(OWNER, REPO)
    );
    const { payload, signature } = await signedReleaseEvent(SECRET);
    await supertest(app)
      .post("/webhook/refresh")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "release")
      .set("X-GitHub-Delivery", "test-delivery-3")
      .set("X-Hub-Signature-256", signature)
      .send(payload)
      .expect(404);
  });
});
