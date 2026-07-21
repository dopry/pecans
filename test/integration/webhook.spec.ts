import { Webhooks } from "@octokit/webhooks";
import express from "express";
import nock from "nock";
import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Backend, type BackendOpts } from "../../src/backends/backend.js";
import { PecansReleases } from "../../src/models/PecansReleases.js";
import {
  buildStableReleaseSet,
  buildRelease,
  buildFullPlatformAssets,
} from "../fixtures/builders.js";
import { configure } from "../../src/index.js";
import {
  configurePecansTestApp,
  configureTestAppWithReleases,
} from "../harness.js";
import { nockGithubListReleases } from "../nock/nockGithubListReleases.js";

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
      { refreshSecret: SECRET },
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
      { refreshSecret: SECRET },
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
      buildStableReleaseSet(OWNER, REPO),
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

describe("/webhook/refresh (generic backend secret middleware)", () => {
  // non-GitHub backends inherit the base Backend middleware, which
  // authenticates via the X-Pecans-Secret header only (a ?secret= query
  // parameter would leak the secret into proxy/access logs; removed in 2.0)
  class RefreshCountingBackend extends Backend {
    public fetchCount = 0;
    constructor(opts?: BackendOpts) {
      super(opts);
    }
    async fetchReleases(): Promise<PecansReleases> {
      this.fetchCount++;
      return new PecansReleases([]);
    }
  }

  function buildGenericApp(opts?: BackendOpts) {
    const backend = new RefreshCountingBackend(opts);
    const { app } = configurePecansTestApp(backend);
    return { backend, app };
  }

  it("refreshes and responds 200 given the X-Pecans-Secret header", async () => {
    const { backend, app } = buildGenericApp({ refreshSecret: SECRET });
    const res = await supertest(app)
      .post("/webhook/refresh")
      .set("X-Pecans-Secret", SECRET)
      .expect(200);
    expect(res.body).toEqual({ refreshed: true });
    expect(backend.fetchCount).toBe(1);
  });

  // the 1.x-era ?secret= transport is gone: query strings land in proxy
  // and access logs, so a valid secret sent that way must not authenticate
  it("rejects a valid secret sent as a query parameter", async () => {
    const { backend, app } = buildGenericApp({ refreshSecret: SECRET });
    await supertest(app).post(`/webhook/refresh?secret=${SECRET}`).expect(403);
    expect(backend.fetchCount).toBe(0);
  });

  it("responds 403 for a wrong secret without refreshing", async () => {
    const { backend, app } = buildGenericApp({ refreshSecret: SECRET });
    const res = await supertest(app)
      .post("/webhook/refresh?secret=wrong")
      .expect(403);
    expect(res.text).toContain("Invalid refresh secret");
    expect(backend.fetchCount).toBe(0);
  });

  it("responds 403 when no secret is sent", async () => {
    const { backend, app } = buildGenericApp({ refreshSecret: SECRET });
    await supertest(app).post("/webhook/refresh").expect(403);
    expect(backend.fetchCount).toBe(0);
  });

  // POST-only contract: other methods fall through without refreshing
  it("ignores non-POST requests even with a valid secret", async () => {
    const { backend, app } = buildGenericApp({ refreshSecret: SECRET });
    await supertest(app)
      .get("/webhook/refresh")
      .set("X-Pecans-Secret", SECRET)
      .expect(404);
    expect(backend.fetchCount).toBe(0);
  });

  it("is a no-op 404 when no refreshSecret is configured", async () => {
    const { backend, app } = buildGenericApp();
    await supertest(app)
      .post("/webhook/refresh")
      .set("X-Pecans-Secret", SECRET)
      .expect(404);
    expect(backend.fetchCount).toBe(0);
  });
});

describe("PECANS_REFRESH_SECRET env wiring (configure())", () => {
  // restore rather than delete, in case the developer's environment set it
  const originalRefreshSecret = process.env.PECANS_REFRESH_SECRET;

  afterEach(() => {
    if (originalRefreshSecret === undefined) {
      delete process.env.PECANS_REFRESH_SECRET;
    } else {
      process.env.PECANS_REFRESH_SECRET = originalRefreshSecret;
    }
    nock.cleanAll();
  });

  it("enables the refresh webhook on the standalone server", async () => {
    process.env.PECANS_REFRESH_SECRET = SECRET;
    const { pecans } = configure();
    const app = express();
    app.use(pecans.router);

    // the refresh triggered by the webhook fetches the release list
    nockGithubListReleases(
      nock,
      OWNER,
      REPO,
      buildStableReleaseSet(OWNER, REPO),
    );

    const { payload, signature } = await signedReleaseEvent(SECRET);
    await supertest(app)
      .post("/webhook/refresh")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "release")
      .set("X-GitHub-Delivery", "env-wiring-delivery")
      .set("X-Hub-Signature-256", signature)
      .send(payload)
      .expect(200);

    // the release handler fires refreshCache without awaiting it; wait for
    // the mocked list-releases call to be consumed so this validates the
    // end-to-end wiring (and cannot race afterEach's nock.cleanAll)
    await vi.waitFor(() => {
      expect(nock.isDone()).toBe(true);
    });
  });

  it("keeps the webhook disabled when the env var is unset", async () => {
    const { pecans } = configure();
    const app = express();
    app.use(pecans.router);
    app.use((req, res) => {
      res.status(404).send("Page not found");
    });

    const { payload, signature } = await signedReleaseEvent(SECRET);
    await supertest(app)
      .post("/webhook/refresh")
      .set("Content-Type", "application/json")
      .set("X-GitHub-Event", "release")
      .set("X-GitHub-Delivery", "env-wiring-delivery-2")
      .set("X-Hub-Signature-256", signature)
      .send(payload)
      .expect(404);
  });
});
