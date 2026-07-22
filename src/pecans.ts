import Debug from "debug";
import {
  type NextFunction,
  type Request,
  type Response,
  Router,
} from "express";
import EventEmitter from "node:events";
import { Backend } from "./backends/index.js";
import { errorHandler, NotFoundError } from "./errors.js";
import {
  createApiChannelsHandler,
  createApiStatusHandler,
  createApiVersionsHandler,
} from "./http/api.js";
import type { PecansHttpContext } from "./http/context.js";
import {
  createDlFilenameHandler,
  createDlHandler,
  createDownloadHandler,
} from "./http/downloads.js";
import { createNotesHandler } from "./http/notes.js";
import {
  createUpdateFormatHandler,
  createUpdateFormatWinHandler,
  createUpdateOSXHandler,
  createUpdateRedirectHandler,
  createUpdateWinHandler,
} from "./http/updates.js";
import type {
  PecansAssetDTO,
  PecansRelease,
  PecansReleaseDTO,
  PecansReleaseQuery,
  PecansReleases,
} from "./models/index.js";
import { ReleaseService } from "./service.js";

// the query helpers moved to src/http/query.ts with the route handlers;
// re-exported here so the package root keeps the same names
export * from "./http/query.js";

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

  /** Route handlers built once from the src/http/* factories over ctx. */
  protected handlers: {
    download: ReturnType<typeof createDownloadHandler>;
    dl: ReturnType<typeof createDlHandler>;
    dlfilename: ReturnType<typeof createDlFilenameHandler>;
    apiChannels: ReturnType<typeof createApiChannelsHandler>;
    apiStatus: ReturnType<typeof createApiStatusHandler>;
    apiVersions: ReturnType<typeof createApiVersionsHandler>;
    updateRedirect: ReturnType<typeof createUpdateRedirectHandler>;
    updateOSX: ReturnType<typeof createUpdateOSXHandler>;
    updateWin: ReturnType<typeof createUpdateWinHandler>;
    updateFormat: ReturnType<typeof createUpdateFormatHandler>;
    updateFormatWin: ReturnType<typeof createUpdateFormatWinHandler>;
    notes: ReturnType<typeof createNotesHandler>;
  };

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

    this.handlers = {
      download: createDownloadHandler(this.ctx),
      dl: createDlHandler(this.ctx),
      dlfilename: createDlFilenameHandler(this.ctx),
      apiChannels: createApiChannelsHandler(this.ctx),
      apiStatus: createApiStatusHandler(this.ctx),
      apiVersions: createApiVersionsHandler(this.ctx),
      updateRedirect: createUpdateRedirectHandler(this.ctx),
      updateOSX: createUpdateOSXHandler(this.ctx),
      updateWin: createUpdateWinHandler(this.ctx),
      updateFormat: createUpdateFormatHandler(this.ctx),
      updateFormatWin: createUpdateFormatWinHandler(this.ctx),
      notes: createNotesHandler(this.ctx),
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
    // update.electronjs.org-compatible format segment (squirrel | msix).
    // Registered after the literal-RELEASES routes so a RELEASES tail keeps
    // hitting the Squirrel.Windows manifest routes. The channel variants
    // are a pecans extension (uejs has no channel concept), mirroring the
    // existing channel routes: channel-in-path survives Squirrel.Windows
    // appending /RELEASES to the feed url and keeps one channel idiom.
    this.router.get(
      "/update/:platform/:format/:version",
      this.handleUpdateFormat.bind(this),
    );
    this.router.get(
      "/update/:platform/:format/:version/RELEASES",
      this.handleUpdateFormatWin.bind(this),
    );
    this.router.get(
      "/update/channel/:channel/:platform/:format/:version",
      this.handleUpdateFormat.bind(this),
    );
    this.router.get(
      "/update/channel/:channel/:platform/:format/:version/RELEASES",
      this.handleUpdateFormatWin.bind(this),
    );

    // translate HttpErrors into their status codes for every route above,
    // regardless of how the host app composes this router
    this.router.use(errorHandler());
  }

  // handler bodies live in src/http/* as factories over the context; these
  // delegates keep the class surface (and its bind() wiring above) unchanged

  async dlfilename(req: Request, res: Response, next: NextFunction) {
    return this.handlers.dlfilename(req, res, next);
  }

  async dl(req: Request, res: Response, next: NextFunction) {
    return this.handlers.dl(req, res, next);
  }

  protected async handleDownload(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    return this.handlers.download(req, res, next);
  }

  protected async handleApiChannels(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    return this.handlers.apiChannels(req, res, next);
  }

  protected async handleApiStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    return this.handlers.apiStatus(req, res, next);
  }

  protected async handleApiVersions(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    return this.handlers.apiVersions(req, res, next);
  }

  protected handleUpdateRedirect(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    return this.handlers.updateRedirect(req, res, next);
  }

  protected async handleUpdateOSX(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    return this.handlers.updateOSX(req, res, next);
  }

  protected async handleUpdateWin(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    return this.handlers.updateWin(req, res, next);
  }

  protected async handleUpdateFormat(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    return this.handlers.updateFormat(req, res, next);
  }

  protected async handleUpdateFormatWin(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    return this.handlers.updateFormatWin(req, res, next);
  }

  protected async handleServeNotes(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    return this.handlers.notes(req, res, next);
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
    // payload keys renamed in 2.0: the release was published as `version`
    // and the asset as `platform` (nuts-era naming)
    this.emit("beforeDownload", { req, release, asset });
    await this.backend.serveAsset(asset, res);
    this.emit("afterDownload", { req, release, asset });
  }
}
