import Debug from "debug";
import { NextFunction, Request, Response, Router } from "express";
import EventEmitter from "node:events";
import { ParsedQs } from "qs";
import { valid, validRange } from "semver";
import { Backend } from "./backends/";
import {
  BadRequestError,
  errorHandler,
  NotFoundError,
  UnsupportedChannelError,
  UnsupportedPlatformError,
  UnsupportedTagError,
} from "./errors";
import {
  PecansAssetDTO,
  PecansRelease,
  PecansReleaseDTO,
  PecansReleaseQuery,
  PecansReleases,
} from "./models/index";
import {
  OPERATING_SYSTEMS,
  Platform,
  filenameToPlatform,
  getPkgFromQuery,
  isOperatingSystem,
  isPlatform,
  isValidArchForOS,
  mapLegacyPlatform,
} from "./utils/";
import {
  SupportedFileExtension,
  getDownloadExtensionsByOs,
  isSupportedFileExtension,
} from "./utils/SupportedFileExtension";
import {
  formatReleaseNote,
  mergeReleaseNotes,
} from "./utils/mergeReleaseNotes";
import { resolveReleaseAssetForVersion } from "./utils/resolveForVersion";
import { generateRELEASES, parseRELEASES } from "./utils/win-releases";
import { VersionFilterOpts, Versions } from "./versions";

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

export type ReqQueryValue =
  string | ParsedQs | (string | ParsedQs)[] | string[] | ParsedQs[] | undefined;

/** single-segment route params are strings; anything else is treated as absent */
export function getStringParam(req: Request, name: string): string | undefined {
  const value = req.params[name];
  return typeof value === "string" ? value : undefined;
}

export function validateReqQueryChannel(channel: ReqQueryValue): string {
  if (typeof channel !== "string") {
    throw new UnsupportedChannelError(channel);
  }
  return channel;
}

//
export function validateReqQueryPlatform(platform: ReqQueryValue): Platform {
  if (!isPlatform(platform)) throw new UnsupportedPlatformError(platform);
  return platform;
}

export function validateReqQueryTag(tag?: ReqQueryValue): string | undefined {
  if (tag == undefined) return;
  if (typeof tag !== "string") {
    throw new UnsupportedTagError(tag);
  }
  // 'latest' is a pecans keyword, everything else must be a semver range
  if (tag !== "latest" && !validRange(tag)) {
    throw new UnsupportedTagError(tag);
  }
  return tag;
}

// return a string value from the req.query if it is a single string,
// otherwise return undefined
export function getStringValueFromRequestQuery(
  query: ParsedQs,
  param: string,
): string | undefined {
  if (!query[param]) return undefined;
  const value = query[param];
  return typeof value === "string" ? value : undefined;
}

export function getVersionFromQuery(query: ParsedQs): string | undefined {
  const value = getStringValueFromRequestQuery(query, "version");
  return value && (validRange(value) || value == "latest") ? value : undefined;
}

export function getFilenameFromQuery(query: ParsedQs): string | undefined {
  return getStringValueFromRequestQuery(query, "filename");
}

export function getFiletypeFromQuery(
  query: ParsedQs,
): SupportedFileExtension | undefined {
  const value = getStringValueFromRequestQuery(query, "filetype");
  if (!value) return undefined;
  const ext = value.startsWith(".") ? value : `.${value}`;
  if (!isSupportedFileExtension(ext))
    throw new BadRequestError(`Unsupported filetype requested (${value})`);
  return ext;
}

export function getPlatformFromQuery(query: ParsedQs): Platform | undefined {
  const value = getStringValueFromRequestQuery(query, "platform");
  return value && isPlatform(value) ? value : undefined;
}

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

  versions: Versions;

  constructor(
    protected backend: Backend,
    opts: PecansOptions = Pecans.defaults,
  ) {
    super();
    this.opts = Object.assign({}, Pecans.defaults, opts);
    if (!this.opts.cacheMaxAge) this.opts.cacheMaxAge = 60 * 60 * 2;
    if (!this.opts.timeout) this.opts.timeout = 60 * 60 * 1000;
    if (!this.opts.basePath) this.opts.basePath = "";

    // Create backend
    this.versions = new Versions(this.backend);
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

  async dlfilename(req: Request, res: Response, next: NextFunction) {
    try {
      const filename = getStringParam(req, "filename");
      // an absent filename must not fall through to queryReleases, where an
      // undefined filename matches every release
      if (!filename) {
        throw new BadRequestError("filename is required");
      }
      const query = { filename };
      const releases = await this.getReleases();
      const matchingReleases = releases.queryReleases(query);
      if (matchingReleases.length == 0) {
        throw new NotFoundError(`${filename} not found`);
      }
      const release = matchingReleases[0];
      const matchingAssets = release.queryAssets(query);
      // Defensive check kept as safety net, the following should never be true with the current implementation of
      // queryReleases. queryReleases calls queryAssets internally with the same query.  So the matchingAssets should
      // always be > 0
      if (matchingAssets.length == 0) {
        throw new NotFoundError(`${filename} not found`);
      }
      const asset = matchingAssets[0];
      this.serveAsset(req, res, release, asset);
    } catch (err) {
      next(err);
    }
  }

  async queryReleases(query: PecansReleaseQuery): Promise<PecansRelease[]> {
    const releases = await this.getReleases();
    return releases.queryReleases(query);
  }

  async dl(req: Request, res: Response, next: NextFunction) {
    try {
      const os = getStringParam(req, "os");
      if (!isOperatingSystem(os)) {
        throw new NotFoundError(
          `Unrecognized OS (${os}) expecting one of ${OPERATING_SYSTEMS.join(", ")}`,
        );
      }

      const arch = getStringParam(req, "arch");
      if (!arch || !isValidArchForOS(os, arch)) {
        throw new NotFoundError(`Unsupported Arch (${arch}) for OS (${os})`);
      }

      const channel = req.query.channel
        ? validateReqQueryChannel(req.query.channel)
        : "stable";
      await this.validateChannelName(channel);
      const version = getVersionFromQuery(req.query);
      const pkg = getPkgFromQuery(req.query);

      const releaseQuery: PecansReleaseQuery = {
        channel,
        os,
        arch,
        version,
        pkg,
      };

      const releases = await this.queryReleases(releaseQuery);
      if (releases.length == 0) {
        throw new NotFoundError("No Matching Releases Found");
      }
      // releases are sorted in version descending order so the first element
      // should be the highest version that matched the que
      const release = releases[0];
      const extensions = getDownloadExtensionsByOs(os, pkg);
      const assetQuery = { arch, version, pkg, extensions };
      const matchingAssets = release.queryAssets(assetQuery);

      if (matchingAssets.length == 0) {
        throw new NotFoundError("No Matching Assets Found");
      }

      const asset = matchingAssets[0];
      this.serveAsset(req, res, release, asset);
    } catch (e) {
      next(e);
    }
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
    return this.backend.releases();
  }

  protected async handleApiChannels(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const releases = await this.getReleases();
      const channels = releases.getChannels();
      res.json(channels);
    } catch (err) {
      next(err);
    }
  }

  protected async handleApiStatus(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      res.send({ uptime: (Date.now() - this.startTime) / 1000 });
    } catch (err) {
      next(err);
    }
  }

  protected async handleApiVersions(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const channel = validateReqQueryChannel(req.query.channel || "*");
      const platform = getPlatformFromQuery(req.query);
      const version = getVersionFromQuery(req.query);
      const opts: VersionFilterOpts = {
        versionRange: version,
        platform,
        channel,
      };

      const versions = await this.versions.filter(opts);
      res.send(versions);
    } catch (err) {
      next(err);
    }
  }

  // Handler for download routes
  protected async handleDownload(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      let channel = validateReqQueryChannel(
        getStringParam(req, "channel") || req.query.channel || "stable",
      );
      const tag = validateReqQueryTag(
        getStringParam(req, "tag") ?? req.query.tag,
      );
      const filename = getStringParam(req, "filename");
      const filetype = getFiletypeFromQuery(req.query);

      // platform autodetection from the user agent was removed in 2.0;
      // selecting a platform is the client's responsibility
      const _platform = filename
        ? filenameToPlatform(filename)
        : getStringParam(req, "platform");
      if (!_platform) {
        throw new BadRequestError(
          "Platform is required. Specify a platform in the URL, e.g. /download/osx_64.",
        );
      }
      const platform = validateReqQueryPlatform(mapLegacyPlatform(_platform));

      // If a specific version was requested, don't enforce a channel; an
      // absent tag means "latest" and keeps the requested/default channel.
      if (tag && tag != "latest") channel = "*";

      let release: PecansRelease | undefined = undefined;
      try {
        release = await this.versions.resolve({
          channel: channel,
          platform,
          versionRange: tag,
          preferUniversal: this.opts.preferUniversal,
        });
      } catch (err) {
        // don't fall back to any channel if we already searched them all;
        // a specific tag widened channel to "*" above, so this covers both
        // "unrestricted" and "specific version requested"
        if (channel == "*") throw err;
      }

      // we weren't able to find a release with the specified channel
      // try again without the channel restriction
      if (!release) {
        release = await this.versions.resolve({
          channel: "*",
          platform,
          versionRange: tag,
          preferUniversal: this.opts.preferUniversal,
        });
      }

      const asset = filename
        ? release.assets.find((i) => i.filename == filename)
        : resolveReleaseAssetForVersion(
            release,
            platform,
            this.opts.preferUniversal,
            filetype,
          );

      if (!asset)
        throw new NotFoundError(
          `No download available for platform ${platform} for version ${release.version} (${channel})`,
        );

      // Call analytic middleware, then serve
      return this.serveAsset(req, res, release, asset);
    } catch (err) {
      next(err);
    }
  }

  // Request to update
  protected handleUpdateRedirect(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.query.version)
        throw new BadRequestError('Requires "version" parameter');
      if (!req.query.platform)
        throw new BadRequestError('Requires "platform" parameter');
      return res.redirect(
        "/update/" + req.query.platform + "/" + req.query.version,
      );
    } catch (err) {
      next(err);
    }
  }

  // Updater used by OSX (Squirrel.Mac) and others
  protected async handleUpdateOSX(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const versionParam = getStringParam(req, "version");
      const platformParam = getStringParam(req, "platform");
      if (!versionParam)
        throw new BadRequestError('Requires "version" parameter');
      if (!platformParam)
        throw new BadRequestError('Requires "platform" parameter');

      const mapped_platform = mapLegacyPlatform(platformParam);
      const platform = validateReqQueryPlatform(mapped_platform);
      // the client reports its installed version, so require a specific
      // semver version; a range would corrupt the ">=" + tag filter below
      if (!valid(versionParam)) {
        throw new BadRequestError(
          `Invalid version (${versionParam}), expected a specific semver version`,
        );
      }
      const tag = versionParam;

      const channel = getStringParam(req, "channel") || "stable";
      const filetype = req.query.filetype ? req.query.filetype : "zip";

      const versions = await this.versions.filter({
        versionRange: ">=" + tag,
        platform,
        channel,
      });
      if (versions.length === 0) return res.status(204).send("No updates");
      const latest = versions[0];
      if (latest.version == tag) return res.status(204).send("No updates");

      const notesSlice =
        versions.length === 1 ? [latest] : versions.slice(0, -1);
      const url = `${this.getBaseUrl(req)}/download/version/${
        latest.version
      }/${platform}?filetype=${filetype}`;
      const releaseNotes = mergeReleaseNotes(
        notesSlice,
        this.opts.includeVersionInReleaseNotes,
      );

      res.status(200).send({
        url,
        name: latest.version,
        notes: releaseNotes,
        pub_date: latest.published_at.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }

  // Update Windows (Squirrel.Windows)
  // Auto-updates: Squirrel.Windows: serve RELEASES from latest version
  // Currently, it will only serve a full.nupkg of the latest release with a normalized filename (for pre-release)
  protected async handleUpdateWin(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const _platform = getStringParam(req, "platform") || "";
      const mapped_platform = mapLegacyPlatform(_platform);
      const platform = validateReqQueryPlatform(mapped_platform);

      const channel = getStringParam(req, "channel") || "stable";
      const tag = getStringParam(req, "version");
      if (!tag) throw new BadRequestError('Requires "version" parameter');
      // the client reports its installed version, so require a specific
      // semver version; a range would corrupt the ">=" + tag filter below
      if (!valid(tag)) {
        throw new BadRequestError(
          `Invalid version (${tag}), expected a specific semver version`,
        );
      }

      const versions = await this.versions.filter({
        versionRange: ">=" + tag,
        platform,
        channel,
      });
      if (versions.length === 0) throw new NotFoundError("Version not found");

      // Update needed?
      const latest = versions[0];

      // File exists
      const asset = latest.assets.find((i) => i.filename == "RELEASES");
      if (!asset) {
        throw new NotFoundError(
          `RELEASES File not found for ${latest.version}`,
        );
      }

      const content = await this.backend.readAsset(asset);
      let releases = await parseRELEASES(content.toString("utf-8"));
      releases = releases
        // Change filename to use download proxy
        .map((entry) => {
          entry.filename = this.getBaseUrl(req) + "/dl/" + entry.filename;
          return entry;
        });

      const output = generateRELEASES(releases);

      // Content-Length is bytes, not UTF-16 code units
      res.header("Content-Length", Buffer.byteLength(output).toString());
      res.attachment("RELEASES");
      res.send(output);
    } catch (err) {
      next(err);
    }
  }

  // Serve releases notes
  protected async handleServeNotes(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      // the path param wins over ?version; an invalid path param is an
      // explicit client error rather than silently serving the latest notes
      const versionParam = getStringParam(req, "version");
      if (
        versionParam &&
        versionParam !== "latest" &&
        !validRange(versionParam)
      ) {
        throw new BadRequestError(
          `Invalid version (${versionParam}), expected 'latest' or a semver range`,
        );
      }
      const version = versionParam ?? getVersionFromQuery(req.query);
      const releases = await this.getReleases();
      const query = { version };
      const candidates = releases.queryReleases(query);
      if (candidates.length === 0) {
        throw new NotFoundError(
          version ? `No release found for version ${version}` : "No releases",
        );
      }
      const release = candidates[0];
      const note = formatReleaseNote(release);

      res.format({
        "application/json": function () {
          res.send({
            note,
          });
        },
        default: function () {
          res.send(note);
        },
      });
    } catch (err) {
      next(err);
    }
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
