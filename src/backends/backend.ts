import { Buffer } from "buffer";
import { createHash, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { pipeline, Writable } from "stream";
import { promisify } from "util";
import { ForbiddenError } from "../errors.js";
import type { PecansReleases } from "../models/index.js";
import type { PecansAssetDTO } from "../models/PecansAsset.js";

const DEFAULT_CACHE_MAX_AGE = 60 * 60 * 2; // 2 hours in seconds

export interface BackendOpts {
  refreshSecret?: string;
  cacheMaxAge?: number;
}

export class BackendSettings implements BackendOpts {
  public refreshSecret = undefined;
  public cacheMaxAge = DEFAULT_CACHE_MAX_AGE;
}

// TRaw is the backend-private payload type this backend stashes on each
// asset's `raw` field (e.g. the GitHub backend uses its API asset object),
// giving the backend typed reads when assets flow back into serveAsset /
// getAssetStream. Opaque (`unknown`) to everyone else.
export abstract class Backend<TRaw = unknown> {
  protected opts: BackendSettings;
  private hash?: string;
  protected cache: PecansReleases | null = null;
  protected cacheTimestamp: number = 0;
  protected cacheRefreshPromise?: Promise<PecansReleases> = undefined;

  constructor(opts?: BackendOpts) {
    this.opts = Object.assign({}, new BackendSettings(), opts);
    if (this.opts.refreshSecret) {
      this.hash = createHash("sha256")
        .update(this.opts.refreshSecret)
        .digest("base64");
    }
  }

  public async refreshCache(): Promise<PecansReleases> {
    // reset the caches, so next call to releases() will fetch new data.
    // but do not delete the existing cache, so we still serve stale data
    // until new data is fetched.
    const promise = this.fetchReleases()
      .then((releases) => {
        this.cache = releases;
        this.cacheTimestamp = Date.now();
        this.cacheRefreshPromise = undefined;
        return releases;
      })
      .catch((error) => {
        console.warn("Cache refresh failed:", error);
        // Reset the promise so we can try again later
        this.cacheRefreshPromise = undefined;
        throw error;
      });
    this.cacheRefreshPromise = promise;
    return promise;
  }

  // List all releases for this repository with caching
  async releases(): Promise<PecansReleases> {
    const now = Date.now();
    const cacheAge = now - this.cacheTimestamp;
    const cacheMaxAgeMs =
      (this.opts.cacheMaxAge ?? DEFAULT_CACHE_MAX_AGE) * 1000;

    // check if we need to refresh the cache.
    if (!this.cache || cacheAge > cacheMaxAgeMs) {
      // return the existing promise if we are already refreshing
      // otherwise start a new refresh.
      const promise = this.cacheRefreshPromise ?? this.refreshCache();
      // If we don't have any cache, wait for the refresh to complete
      if (!this.cache) return promise;
      // Stale data is served below while the refresh runs in the background;
      // its failure is already logged in refreshCache and must not surface
      // as an unhandled rejection that kills the process (#14)
      promise.catch(() => {});
    }
    // Cache is present, return it
    return this.cache;
  }

  // Return an express middleware guarding a cache-refresh endpoint, for
  // backends without their own webhook verification (the GitHub backend
  // overrides this with signed-payload verification via @octokit/webhooks).
  //
  // The caller authenticates by sending the configured refreshSecret in an
  // `X-Pecans-Secret` header or `?secret=` query parameter; a request on the
  // watched path with a missing or wrong secret gets a 403. When no
  // refreshSecret is configured the middleware is a pass-through and the
  // endpoint stays disabled — the secret requirement prevents DOS attacks
  // against update infrastructure.
  // ex) `app.use(backend.getRefreshWebhookMiddleware('/api/backend/refresh'))`
  getRefreshWebhookMiddleware(
    // path that the middleware will watch.
    path: string,
  ): (req: Request, res: Response, next: NextFunction) => void {
    const middleware = (req: Request, res: Response, next: NextFunction) => {
      // only do stuff if a secret was provided, otherwise just call next.
      if (!this.hash) {
        next();
        return;
      }
      if (req.path !== path) {
        next();
        return;
      }
      // the refresh contract is POST-only (matching the GitHub backend's
      // webhook middleware); other methods fall through so crawlers hitting
      // a shared ?secret= link can't trigger refreshes and preflights
      // aren't answered with 403
      if (req.method !== "POST") {
        next();
        return;
      }
      // the middleware is mounted with use(), so req.params is never
      // populated here - the secret arrives as a header or query parameter
      const query = req.query.secret;
      const provided =
        req.get("x-pecans-secret") ??
        (typeof query === "string" ? query : undefined);
      if (!provided || !this.verifyRefreshSecret(provided)) {
        next(new ForbiddenError("Invalid refresh secret"));
        return;
      }
      this.refreshCache()
        .then(() => {
          res.status(200).json({ refreshed: true });
        })
        .catch((err) => {
          next(err);
        });
    };
    return middleware;
  }

  // constant-time comparison of the provided secret's sha256 against the
  // stored hash, so the comparison doesn't leak match progress via timing
  private verifyRefreshSecret(provided: string): boolean {
    if (!this.hash) return false;
    const expected = Buffer.from(this.hash, "base64");
    const actual = createHash("sha256").update(provided).digest();
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }

  // Abstract method for backends to implement actual fetching logic
  abstract fetchReleases(): Promise<PecansReleases>;

  // Serve an asset to the response (redirect or stream). Backends must
  // override this to deliver the assets they created.
  async serveAsset(asset: PecansAssetDTO<TRaw>, res: Response) {
    throw Error("Abstract Method");
  }

  // Return stream for an asset
  async getAssetStream(
    asset: PecansAssetDTO<TRaw>,
  ): Promise<NodeJS.ReadableStream | null> {
    throw Error("Abstract Method");
  }

  // Return buffer for an asset stream
  // Requires Node.js 22+ for proper stream handling with pipeline()
  async readAsset(asset: PecansAssetDTO<TRaw>): Promise<Buffer> {
    const stream = await this.getAssetStream(asset);
    if (stream == null) {
      return Buffer.from("");
    }

    const chunks: Buffer[] = [];
    const writable = new Writable({
      write(chunk, encoding, callback) {
        chunks.push(chunk);
        callback();
      },
      // Handle destroy properly for Node.js 22+ compatibility
      destroy(error, callback) {
        callback(error);
      },
    });

    try {
      await promisify(pipeline)(stream, writable);
      return Buffer.concat(chunks);
    } catch (error) {
      // Enhance error messages for better debugging in Node.js 22+
      if (error instanceof Error) {
        if (error.message.includes("Premature close")) {
          throw new Error(
            `Stream closed unexpectedly while reading asset ${asset.id}: ${error.message}`,
            { cause: error },
          );
        }
        throw new Error(`Failed to read asset ${asset.id}: ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }
  }
}
