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
  // use to salt cache keys to allow updates onRelease().
  protected cacheId = 0;
  protected opts: BackendSettings;
  private hash?: string;
  protected releasesCache: Record<string, Promise<PecansReleases>> = {};
  protected cacheTimestamp = 0;

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
    this.cacheId++;
    this.releasesCache = {};
    this.cacheTimestamp = 0;
    // Trigger background cache repopulation
    this.repopulateCache();
  }

  private async repopulateCache(): Promise<void> {
    try {
      const cacheKey = this.getCacheKey();
      await this.fetchAndCacheReleases(cacheKey);
    } catch (error) {
      console.warn('Cache repopulation failed:', error);
    }
  }

  protected getCacheKey(): string {
    // use a time based key to ensure the cached releases are updated when cacheMaxAge is reached.
    const timeSlot = Math.floor(Date.now() / (this.opts.cacheMaxAge! * 1000));
    return `${this.cacheId}_${timeSlot}`;
  }

  private async refreshReleasesInBackground(cacheKey: string): Promise<void> {
    try {
      await this.fetchAndCacheReleases(cacheKey);
    } catch (error) {
      // Background refresh failed, keep existing cache
      console.warn('Background refresh of releases failed:', error);
    }
  }

  private async fetchAndCacheReleases(cacheKey: string): Promise<PecansReleases> {
    if (!(cacheKey in this.releasesCache)) {
      this.releasesCache[cacheKey] = this.fetchReleases();
      this.cacheTimestamp = Date.now();
    }
    return this.releasesCache[cacheKey];
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

  // List all releases for this repository with caching
  async releases(): Promise<PecansReleases> {
    const cacheKey = this.getCacheKey();
    
    // Check if we have a cached version
    if (cacheKey in this.releasesCache) {
      // Return cached version immediately (stale-while-revalidate)
      const cachedReleases = this.releasesCache[cacheKey];
      
      // Trigger background update if cache is old
      const now = Date.now();
      if (now - this.cacheTimestamp > this.opts.cacheMaxAge! * 1000) {
        // Start background refresh without awaiting
        this.refreshReleasesInBackground(cacheKey);
      }
      
      return cachedReleases;
    }
    
    // No cache exists, fetch and cache
    return this.fetchAndCacheReleases(cacheKey);
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
