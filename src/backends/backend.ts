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
  protected releasesCache: PecansReleases | null = null;
  protected releaseCacheTimestamp: number = 0;
  protected releaseCacheRefreshPromise: Promise<PecansReleases> | null = null;

  constructor(opts?: BackendOpts) {
    this.opts = Object.assign({}, new BackendSettings(), opts);
    if (this.opts.refreshSecret) {
      this.hash = createHash("sha256")
        .update(this.opts.refreshSecret)
        .digest("base64");
    }
  }

  // New release? clear cache and repopulate
  onRelease() {
    this.releasesCache = null;
    this.releaseCacheTimestamp = 0;
    this.releaseCacheRefreshPromise = null;
    // Trigger background cache repopulation
    this.repopulateCache();
  }

  private async repopulateCache(): Promise<void> {
    try {
      await this.releases();
    } catch (error) {
      console.warn('Cache repopulation failed:', error);
    }
  }

  // List all releases for this repository with caching
  async releases(): Promise<PecansReleases> {
    const now = Date.now();
    const cacheAge = now - this.releaseCacheTimestamp;
    const cacheMaxAgeMs = this.opts.cacheMaxAge! * 1000;
    
    // If we have cached data
    if (this.releasesCache) {
      // If cache is still fresh, return it immediately
      if (cacheAge < cacheMaxAgeMs) {
        return this.releasesCache;
      }
      
      // Cache is stale - return it immediately but trigger background refresh
      if (!this.releaseCacheRefreshPromise) {
        this.releaseCacheRefreshPromise = this.fetchReleases().then(releases => {
          this.releasesCache = releases;
          this.releaseCacheTimestamp = Date.now();
          this.releaseCacheRefreshPromise = null;
          return releases;
        }).catch(error => {
          console.warn('Background cache refresh failed:', error);
          // Reset the promise so we can try again later
          this.releaseCacheRefreshPromise = null;
          // Return the existing cache data rather than throwing
          return this.releasesCache!;
        });
      }
      
      // Return stale cache immediately
      return this.releasesCache;
    }
    
    // No cache exists - fetch synchronously
    if (!this.releaseCacheRefreshPromise) {
      this.releaseCacheRefreshPromise = this.fetchReleases().then(releases => {
        this.releasesCache = releases;
        this.releaseCacheTimestamp = Date.now();
        this.releaseCacheRefreshPromise = null;
        return releases;
      });
    }
    
    return this.releaseCacheRefreshPromise;
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
      this.onRelease();
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
