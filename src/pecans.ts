import Debug from "debug";
import { NextFunction, Request, Response, Router } from "express";
import EventEmitter from "node:events";
import { ParsedQs } from "qs";
import { Backend } from "./backends/";
import { errorHandler, NotFoundError } from "./errors";
import {
  handleApiChannels,
  handleApiStatus,
  handleApiVersions,
} from "./http/api";
import { PecansHttpContext } from "./http/context";
import { dl, dlfilename, handleDownload } from "./http/downloads";
import { handleServeNotes } from "./http/notes";
import {
  handleUpdateOSX,
  handleUpdateRedirect,
  handleUpdateWin,
} from "./http/updates";
import {
  PecansAssetDTO,
  PecansRelease,
  PecansReleaseDTO,
  PecansReleaseQuery,
  PecansReleases,
} from "./models/index";
import { ReleaseService } from "./service";

// the query helpers moved to src/http/query.ts with the route handlers;
// re-exported here so the package root keeps the same names
export * from "./http/query";

const logger = Debug("pecans");

export interface PecansSettings {
  /** @deprecated accepted but unused (defaulted, no functional effect); will be removed in 3.0 */
  timeout: number;
  /** Base path for all routes */
  basePath: string;
  /** Max age for releases cache (seconds) */
  cacheMaxAge: number;
  /** If universal build exists, prefer it over platform specific builds */
  preferUniversal: boolean;
  /** Whether to include version in the aggregation of release notes when comparing versions */
  includeVersionInReleaseNotes: boolean;
}

export type PecansOptions = Partial<PecansSettings>;

/**
 * Composition root: wires the backend, the ReleaseService pipeline, and the
 * route handlers (src/http/*) onto an express Router, and emits the
 * beforeDownload/afterDownload events around asset serving.
 */
export class Pecans extends EventEmitter {
  protected startTime = Date.now();
  protected opts: PecansSettings;

  static defaults: PecansSettings = {
    timeout: 60 * 60 * 1000,
    cacheMaxAge: 60 * 60 * 2,
    basePath: "",
    preferUniversal: true,
    includeVersionInReleaseNotes: false,
  };

  public router: Router;

  /** Unified release/asset resolution pipeline all route handlers use. */
  protected service: ReleaseService;

  /** The capabilities the src/http/* handlers get from this class. */
  protected ctx: PecansHttpContext;

  constructor(
    protected backend: Backend,
    opts: PecansOptions = Pecans.defaults,
  ) {
    super();
    this.opts = Object.assign({}, Pecans.defaults, opts);
    if (!this.opts.cacheMaxAge) this.opts.cacheMaxAge = 60 * 60 * 2;
    if (!this.opts.timeout) this.opts.timeout = 60 * 60 * 1000;
    if (!this.opts.basePath) this.opts.basePath = "";

    this.service = new ReleaseService(this.backend, {
      preferUniversal: this.opts.preferUniversal,
    });

    this.ctx = {
      service: this.service,
      getReleases: () => this.getReleases(),
      queryReleases: (query) => this.queryReleases(query),
      getBaseUrl: (req) => this.getBaseUrl(req),
      serveAsset: (req, res, release, asset) =>
        this.serveAsset(req, res, release, asset),
      readAsset: (asset) => this.backend.readAsset(asset),
      uptimeSeconds: () => (Date.now() - this.startTime) / 1000,
      validateChannelName: (name) => this.validateChannelName(name),
      includeVersionInReleaseNotes: () =>
        this.opts.includeVersionInReleaseNotes,
    };

    this.router = Router();

    // Log requests
    this.router.use((req, res, next) => {
      logger(`${req.method} ${req.url}`);
      return next();
    });

    // this will need to be called by the backends webhook infrastructure,
    // the semantic will vary by backend.
    this.router.use(
      this.backend.getRefreshWebhookMiddleware("/webhook/refresh"),
    );

    // #region download endpoints
    this.router.get(
      "/download/channel/:channel{/:platform}",
      this.handleDownload.bind(this),
    );
    // /download/version must register before /download/:tag/:filename or the
    // literal "version" segment is captured as :tag and the request 500s.
    this.router.get(
      "/download/version/:tag{/:platform}",
      this.handleDownload.bind(this),
    );
    this.router.get("/download{/:platform}", this.handleDownload.bind(this));
    this.router.get("/download/:tag/:filename", this.handleDownload.bind(this));

    // the /dl path will supersede the /download/**  paths
    this.router.get("/dl/:filename", this.dlfilename.bind(this));
    // ?channel?version
    this.router.get("/dl/:os/:arch", this.dl.bind(this));
    // #endregion

    this.router.get("/api/channels", this.handleApiChannels.bind(this));
    this.router.get("/api/status", this.handleApiStatus.bind(this));
    // ?channel?platform?version
    this.router.get("/api/versions", this.handleApiVersions.bind(this));

    this.router.get("/notes{/:version}", this.handleServeNotes.bind(this));
    // @deprecated - the /update endpoint is deprecated, please use /update/:platform/:version
    this.router.get("/update", this.handleUpdateRedirect.bind(this));
    this.router.get(
      "/update/:platform/:version",
      this.handleUpdateOSX.bind(this),
    );
    this.router.get(
      "/update/channel/:channel/:platform/:version",
      this.handleUpdateOSX.bind(this),
    );
    this.router.get(
      "/update/:platform/:version/RELEASES",
      this.handleUpdateWin.bind(this),
    );
    this.router.get(
      "/update/channel/:channel/:platform/:version/RELEASES",
      this.handleUpdateWin.bind(this),
    );

    // translate HttpErrors into their status codes for every route above,
    // regardless of how the host app composes this router
    this.router.use(errorHandler());
  }

  // handler bodies live in src/http/*; these delegates keep the class
  // surface (and its bind() wiring above) unchanged

  async dlfilename(req: Request, res: Response, next: NextFunction) {
    return dlfilename(this.ctx, req, res, next);
  }

  async dl(req: Request, res: Response, next: NextFunction) {
    return dl(this.ctx, req, res, next);
  }

  protected async handleDownload(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    return handleDownload(this.ctx, req, res, next);
  }

  protected async handleApiChannels(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    return handleApiChannels(this.ctx, req, res, next);
  }

  protected async handleApiStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    return handleApiStatus(this.ctx, req, res, next);
  }

  protected async handleApiVersions(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    return handleApiVersions(this.ctx, req, res, next);
  }

  protected handleUpdateRedirect(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    return handleUpdateRedirect(this.ctx, req, res, next);
  }

  protected async handleUpdateOSX(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    return handleUpdateOSX(this.ctx, req, res, next);
  }

  protected async handleUpdateWin(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    return handleUpdateWin(this.ctx, req, res, next);
  }

  protected async handleServeNotes(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    return handleServeNotes(this.ctx, req, res, next);
  }

  async queryReleases(query: PecansReleaseQuery): Promise<PecansRelease[]> {
    return this.service.queryReleases(query);
  }

  async validateChannelName(name: string): Promise<void> {
    const releases = await this.getReleases();
    const names = releases.getChannelNames();
    if (!names.includes(name)) {
      throw new NotFoundError(`Invalid Channel: ${name}`);
    }
  }

  async getChannelFromQuery(query: ParsedQs): Promise<string | undefined> {
    const releases = await this.getReleases();
    const channels = releases.getChannelNames();
    const channel =
      query.channel && typeof query.channel === "string"
        ? query.channel
        : "stable";
    if (channels.includes(channel)) {
      return channel;
    }
    return;
  }

  protected getBaseUrl(req: Request) {
    return req.protocol + "://" + req.get("host") + this.opts.basePath;
  }

  protected getFullUrl(req: Request) {
    return this.getBaseUrl(req) + req.originalUrl;
  }

  public async getReleases(): Promise<PecansReleases> {
    return this.service.getReleases();
  }

  // Serve an asset to the response
  protected async serveAsset(
    req: Request,
    res: Response,
    release: PecansReleaseDTO,
    asset: PecansAssetDTO,
  ) {
    this.emit("beforeDownload", {
      req: req,
      version: release,
      platform: asset,
    });
    await this.backend.serveAsset(asset, res);
    this.emit("afterDownload", {
      req: req,
      version: release,
      platform: asset,
    });
  }
}
