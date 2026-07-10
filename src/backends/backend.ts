import { Buffer } from "buffer";
import { createHash } from "crypto";
import { NextFunction, Request, Response } from "express";
import { pipeline, Writable } from "stream";
import { promisify } from "util";
import { PecansReleases } from "../models";
import { PecansAsset, PecansAssetDTO } from "../models/PecansAsset";

const DEFAULT_CACHE_MAX_AGE = 60 * 60 * 2; // 2 hours in seconds

export interface BackendOpts {
  refreshSecret?: string;
  cacheMaxAge?: number;
}

export class BackendSettings implements BackendOpts {
  public refreshSecret = undefined;
  public cacheMaxAge = DEFAULT_CACHE_MAX_AGE;
}

export abstract class Backend {
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
    }
    // Cache is present, return it
    return this.cache;
  }

  // return an express middlware to catch a specific path
  // ex) `app.use(backend.getRefreshMiddleware('/api/backend/refresh'))`
  getRefreshWebhookMiddleware(
    // path that the firmware will watch.
    path: string,
  ): (req: Request, res: Response, nex: NextFunction) => void {
    // the default refresh callback expects a base64 encoded sha256 hash of the refreshSecret.
    // the secret is to prevent DOS attacks against update infrastructure.
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
      if (this.hash != req.params.secret) {
        next("bad secret");
        return;
      }
      this.refreshCache()
        .then(() => {
          next();
        })
        .catch((err) => {
          next(err);
        });
    };
    return middleware;
  }

  // Abstract method for backends to implement actual fetching logic
  abstract fetchReleases(): Promise<PecansReleases>;

  // Return stream for an asset, serving out of the LRU cache if available.
  async serveAsset(asset: PecansAssetDTO, res: Response) {
    throw Error("Abstract Method");
  }

  // Return stream for an asset
  async getAssetStream(
    asset: PecansAsset,
  ): Promise<NodeJS.ReadableStream | null> {
    throw Error("Abstract Method");
  }

  // Return buffer for an asset stream
  // Requires Node.js 22+ for proper stream handling with pipeline()
  async readAsset(asset: PecansAsset): Promise<Buffer> {
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
