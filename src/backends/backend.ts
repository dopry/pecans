import destroy from "destroy";
import { createHash } from "crypto";
import { NextFunction, Request, Response } from "express";
import { Buffer } from "buffer";
import { PecansAsset, PecansAssetDTO } from "../models/PecansAsset";
import { PecansReleases } from "../models";

export interface BackendOpts {
  refreshSecret?: string;
  cacheMaxAge?: number;
}

export class BackendSettings implements BackendOpts {
  public refreshSecret = undefined;
  public cacheMaxAge = 60 * 60 * 2; // 2 hours in seconds
}

function cleanup(stream: NodeJS.ReadableStream) {
  destroy(stream);
  stream.removeAllListeners();
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
    const cacheMaxAgeMs = this.opts.cacheMaxAge! * 1000;

    // check if we need to refresh the cache.
    if (!this.cache || cacheAge > cacheMaxAgeMs) {
      const promise = this.refreshCache();
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
    path: string
  ): (req: Request, res: Response, nex: NextFunction) => void {
    // the default refresh callback expects a base64 encoded sha256 hash of the refreshSecret.
    // the secret is to prevent DOS attacks against update infrastructure.
    const middleware = (req: Request, res: Response, next: NextFunction) => {
      // on do stuff is a secret was provided, otherwise just call next.
      if (!this.hash) next();
      if (req.path !== path) next();
      if (this.hash != req.params.secret) {
        next("bad secret");
      }
      this.refreshCache();
      res.send(200);
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
    asset: PecansAsset
  ): Promise<NodeJS.ReadableStream | null> {
    throw Error("Abstract Method");
  }

  // Return stream for an asset
  async readAsset(asset: PecansAsset): Promise<Buffer> {
    const stream = await this.getAssetStream(asset);
    if (stream == null) {
      return Buffer.from("");
    }
    return new Promise((resolve, reject) => {
      let output = Buffer.alloc(0);

      stream
        .on("data", (buf) => {
          output = Buffer.concat([output, buf]);
        })
        .on("error", (err) => {
          cleanup(stream);
          reject(err);
        })
        .on("end", () => {
          cleanup(stream);
          resolve(output);
        });
    });
  }
}
