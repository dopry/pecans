import { NextFunction, Request, Response, Router } from "express";
import useragent from "express-useragent";
import Debug from "debug";

import EventEmitter from "node:events";
import { ParsedQs } from "qs";
import { validRange } from "semver";
import { Backend } from "./backends/";
import {
  PecansAssetDTO,
  PecansRelease,
  PecansReleaseDTO,
  PecansReleaseQuery,
  PecansReleases,
} from "./models/index";
import {
  Architecture,
  OPERATING_SYSTEMS,
  OperatingSystem,
  PLATFORMS,
  Platform,
  SUPPORTED_ARCHITECTURES,
  SupportedArchitecture,
  filenameToPlatform,
  getPkgFromQuery,
  isOperatingSystem,
  isPlatform,
  mapLegacyPlatform,
  paramToSupportedArchitectures,
  platforms,
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
  /** Timeout for releases cache (seconds) */
  timeout: number;
  /** Base path for all routes */
  basePath: string;
  /** Max age for releases cache (seconds) */
  cacheMaxAge: number;
  /** If universal build exists, prefer it over platform specific builds */
  preferUniversal: boolean;
}

export interface PecansOptions extends Partial<PecansSettings> {}

export class UnsupportedPlatformError extends Error {
  constructor(platform: unknown) {
    const platforms = PLATFORMS.join(", ");
    const message = `Unsupported platform (${platform}), expected one of [${platforms}]`;
    super(message);
  }
}

export class UnsupportedChannelError extends Error {
  constructor(channel: unknown) {
    const message = `Unsupported channel (${channel}), expected a single string of 'stable', '*' or a user-defined channel`;
    super(message);
  }
}

export class UnsupportedTagError extends Error {
  constructor(tag: unknown) {
    const message = `Unsupported channel (${tag}), expected a single string`;
    super(message);
  }
}

export function validateReqQueryChannel(
  channel: string | ParsedQs | string[] | ParsedQs[]
): string {
  if (typeof channel !== "string") {
    throw new UnsupportedChannelError(channel);
  }
  return channel;
}

//
export function validateReqQueryPlatform(
  platform: string | ParsedQs | string[] | ParsedQs[] | undefined
): Platform | undefined {
  if (!isPlatform(platform)) throw new UnsupportedPlatformError(platform);
  return platform;
}

export function validateReqQueryTag(
  tag?: string | ParsedQs | string[] | ParsedQs[]
): string | undefined {
  if (tag == undefined) return;
  if (typeof tag !== "string") {
    throw new UnsupportedTagError(tag);
  }
  validRange(tag);
  return tag;
}

export interface ExpressUserAgent {
  isMac: boolean;
  isWindows: boolean;
  isLinux: boolean;
  isLinux64: boolean;
}
export interface ExpressRequestUserAgent {
  useragent?: useragent.Details;
}

export function getPlatformFromUserAgent(
  req: Request & ExpressRequestUserAgent
) {
  // requires useragent middleware.
  if (!req.useragent) return;
  if (req.useragent.isMac) return platforms.OSX;
  if (req.useragent.isWindows) return platforms.WINDOWS;
  if (req.useragent.isLinux) return platforms.LINUX;
  if (req.useragent.isLinux64) return platforms.LINUX_64;
}
// return a string value from the req.query if it is a single string,
// otherwise return undefined
export function getStringValueFromRequestQuery(
  query: ParsedQs,
  param: string
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
  query: ParsedQs
): SupportedFileExtension | undefined {
  const value = getStringValueFromRequestQuery(query, "filetype");
  if (!value) return undefined;
  const ext = value.startsWith(".") ? value : `.${value}`;
  return isSupportedFileExtension(ext) ? ext : undefined;
}

export function getPlatformFromQuery(query: ParsedQs): Platform | undefined {
  const value = getStringValueFromRequestQuery(query, "platform");
  return value && isPlatform(value) ? value : undefined;
}

export function getArchFromUserAgent(
  useragent?: useragent.Details
): Architecture | undefined {
  // these are arbitrary defaults
  if (!useragent) return;
  if (useragent.isMac) return "64";
  if (useragent.isWindows) return "32";
  if (useragent.isLinux) return "32";
  if (useragent.isLinux64) return "64";
}

export class Pecans extends EventEmitter {
  protected startTime = Date.now();
  protected cacheId = 1;
  protected opts: PecansSettings;

  static defaults: PecansSettings = {
    timeout: 60 * 60 * 1000,
    cacheMaxAge: 60 * 60 * 2,
    basePath: "",
    preferUniversal: true,
  };

  protected releasesCache: Record<string, Promise<PecansReleases>> = {};

  public router: Router;

  versions: Versions;

  constructor(
    protected backend: Backend,
    opts: PecansOptions = Pecans.defaults
  ) {
    super();
    this.opts = Object.assign({}, Pecans.defaults, opts);
    if (!this.opts.cacheMaxAge) this.opts.cacheMaxAge = 60 * 60 * 2;
    if (!this.opts.timeout) this.opts.timeout = 60 * 60 * 1000;
    if (!this.opts.basePath) this.opts.basePath = "";

    this.releasesCache[this.getCacheKey()] = backend.releases();

    // Create backend
    this.versions = new Versions(this.backend);
    this.router = Router();

    // Log requests
    this.router.use((req, res, next) => {
      logger(`${req.method} ${req.url}`);
      return next();
    });

    // Bind routes
    this.router.use(useragent.express());

    // this will need to be called by the backends webhook infrastructure,
    // the semantic will vary by backend.
    this.router.use(
      this.backend.getRefreshWebhookMiddleware("/webhook/refresh")
    );

    // #region deprecated endpoints
    // @deprecated - the /download endpoint is deprecated, please use /dl/:os/:arch
    this.router.get("/", this.handleDownload.bind(this));
    // @deprecated - the /download/channel/:channel/:platform? endpoint is deprecated, please use /dl/:os/:arch?channel=
    this.router.get(
      "/download/channel/:channel/:platform?",
      this.handleDownload.bind(this)
    );
    // @deprecated - the /download/:platform? endpoint is deprecated, please use /dl/:os/:arch
    this.router.get("/download/:platform?", this.handleDownload.bind(this));
    // @deprecated - the /download/:tag/:filename endpoint is deprecated, please use /dl/:filename
    this.router.get("/download/:tag/:filename", this.handleDownload.bind(this));
    // @deprecated - the /download/:tag/:platform? endpoint is deprecated, please use /dl/:os/:arch?version=
    this.router.get(
      "/download/version/:tag/:platform?",
      this.handleDownload.bind(this)
    );
    // #endregion

    // #region deprecated update endpoints
    // Mac updates
    // @deprecated - the /update/:platform/:version endpoint is deprecated, please use /up/:os/:arch/:currentVersion for mac instead
    this.router.get(
      "/update/:platform/:version",
      this.handleUpdateOSX.bind(this)
    );
    // @deprecated - the /update/:platform/:version endpoint is deprecated, please use /up/:os/:arch/:currentVersion?channel for mac instead
    this.router.get(
      "/update/channel/:channel/:platform/:version",
      this.handleUpdateOSX.bind(this)
    );

    // Squirrel Update endpoints
    // @deprecated - the /update/:platform/:version/RELEASES endpoint is deprecated, please use /up/:os/:arch/:version/RELEASES?channel for windows squirrel instead
    this.router.get(
      "/update/:platform/:version/RELEASES",
      this.handleUpdateWin.bind(this)
    );
    // @deprecated - the /update/channel/:channel/:platform/:version/RELEASES endpoint is deprecated, please use /up/:os/:arch/:version/RELEASES?channel for windows squirrel instead
    this.router.get(
      "/update/channel/:channel/:platform/:version/RELEASES",
      this.handleUpdateWin.bind(this)
    );
    // #endregion

    // #region api endpoints
    this.router.get("/api/channels", this.handleApiChannels.bind(this));
    // ?channel?platform?version
    this.router.get("/api/versions", this.handleApiVersions.bind(this));
    this.router.get("/notes/:version?", this.handleServeNotes.bind(this));
    // #endregion

    // #region download endpoints
    this.router.get("/dl/:filename", this.dlfilename.bind(this));
    // optional query params: channel, version, pkg
    this.router.get("/dl/:os/:arch", this.dl.bind(this));
    // #endregion

    // # region curren update endpoints
    // optional querystrings ?channel
    // this.router.get(
    //   "/up/:os/:arch/:version/RELEASES",
    //   this.handleUpdatesWindowsSquirrel.bind(this)
    // );
    // // optional querystrings ?channel
    // this.router.get(
    //   "/up/:os/:arch/:version",
    //   this.handleUpdatesDarwin.bind(this)
    // );

    // #endregion
  }

  async dlfilename(req: Request, res: Response, next: NextFunction) {
    try {
      const filename = req.params.filename;
      const query = { filename };
      const releases = await this.getReleases();
      const matchingReleases = releases.queryReleases(query);
      if (matchingReleases.length == 0) {
        return res.status(404).send(`${filename} not found`);
      }
      const release = matchingReleases[0];
      const matchingAssets = release.queryAssets(query);
      if (matchingAssets.length == 0) {
        return res.status(404).send(`${filename} not found`);
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
      const channel = req.params.channel;
      try {
        await this.validateChannelName(channel);
      } catch (err) {
        if (err instanceof Error) res.status(404).send(err.message);
        else res.status(404).send(`Unrecognized Channel: ${channel}`);
        return;
      }

      const os = req.params.os;
      if (!isOperatingSystem(os)) {
        res
          .status(404)
          .send(
            `Unrecognized OS (${os}) expecting one of ${OPERATING_SYSTEMS.join(
              ", "
            )} `
          );
        return;
      }

      const archs = paramToSupportedArchitectures(req.params.arch);

      if (archs.length == 0) {
        res
          .status(404)
          .send(
            `Unsupported Arch (${
              req.params.arch
            }) expecting one of ${SUPPORTED_ARCHITECTURES.join(
              ", "
            )}, univ, universal`
          );
        return;
      }

      const version = getVersionFromQuery(req.query);
      const pkg = getPkgFromQuery(req.query);

      const releaseQuery: PecansReleaseQuery = {
        channel,
        os,
        archs,
        version,
        pkg,
      };

      const releases = await this.queryReleases(releaseQuery);
      if (releases.length == 0) {
        res.status(404).send("No Matching Releases Found");
        return;
      }
      // releases are sorted in version descending order so the first element
      // should be the highest version that matched the que
      const release = releases[0];
      const extensions = getDownloadExtensionsByOs(os, pkg);
      const assetQuery = { archs, version, pkg, extensions };
      const matchingAssets = release.queryAssets(assetQuery);

      if (matchingAssets.length == 0) {
        res.status(404).send("No Matching Assets Found");
        return;
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
      const msg = `Unrecognized Channel (${name}) expecting one of ${names.join(
        ", "
      )}`;
      throw new Error(msg);
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

  protected getCacheKey(): number {
    // use a time based key to ensure the cached releases are update when cacheMaxAge is reached.
    return this.cacheId + Math.ceil(Date.now() / this.opts.cacheMaxAge);
  }

  protected getBaseUrl(req: Request) {
    return req.protocol + "://" + req.get("host") + this.opts.basePath;
  }

  protected getFullUrl(req: Request) {
    return this.getBaseUrl(req) + req.originalUrl;
  }

  public async getReleases(): Promise<PecansReleases> {
    const key = this.getCacheKey();
    if (!this.releasesCache[key]) {
      this.releasesCache[key] = this.backend.releases();
    }
    return this.releasesCache[key];
  }

  protected async handleApiChannels(
    req: Request,
    res: Response,
    next: NextFunction
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
    next: NextFunction
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
    next: NextFunction
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
  // @deprecated use dl or dlfile instead.
  protected async handleDownload(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      let channel = validateReqQueryChannel(req.query.channel || "stable");
      const tag = validateReqQueryTag(req.query.tag);
      const filename = req.params.filename;
      const filetype = getFiletypeFromQuery(req.query);

      if (filetype && !isSupportedFileExtension(filetype)) {
        throw new Error("Unsupported FileType Requested");
      }

      const _platform = filename
        ? filenameToPlatform(filename)
        : req.params.platform || getPlatformFromUserAgent(req);
      const mapped_platform = mapLegacyPlatform(_platform || "");
      const platform = validateReqQueryPlatform(mapped_platform);
      if (platform == undefined) {
        throw new Error("Platform is required");
      }

      // If specific version, don't enforce a channel
      if (tag != "latest") channel = "*";

      let release: PecansRelease | undefined = undefined;
      try {
        release = await this.versions.resolve({
          channel: channel,
          platform: platform,
          versionRange: tag,
          preferUniversal: this.opts.preferUniversal,
        });
      } catch (err) {
        if (channel || tag != "latest") throw err;
      }

      if (!release) {
        release = await this.versions.resolve({
          channel: "*",
          platform: platform,
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
            filetype
          );

      if (!asset)
        throw new Error(
          "No download available for platform " +
            platform +
            " for version " +
            release.version +
            " (" +
            (channel || "beta") +
            ")"
        );

      // Call analytic middleware, then serve
      return this.serveAsset(req, res, release, asset);
    } catch (err) {
      next(err);
    }
  }

  async validateOperatingSystem(os: string) {
    if (!isOperatingSystem(os)) {
      throw new Error(
        `Unrecognized OS (${os}) expecting one of ${OPERATING_SYSTEMS.join(
          ", "
        )} `
      );
    }
  }

  async findUpdateReleases(
    os: OperatingSystem,
    archs: SupportedArchitecture[],
    currentVersion: string,
    channel = "stable"
  ) {
    const releaseQuery: PecansReleaseQuery = {
      channel,
      os,
      archs,
      version: `>=${currentVersion}`,
      pkg: "zip",
    };

    const releases = await this.queryReleases(releaseQuery);
    return releases;
  }

  async handleUpdateDarwin(req: Request, res: Response, next: NextFunction) {
    const os = req.params.os;
    if (!os) return res.status(404).send("Missing os from update path");
    if (!isOperatingSystem(os)) {
      res
        .status(404)
        .send(
          `Unrecognized OS (${os}) in update path  expecting one of ${OPERATING_SYSTEMS.join(
            ", "
          )} `
        );
      return;
    }
    const version = req.params.version;
    if (!version)
      return res.status(500).send("Missing version from update path");
    const archs = paramToSupportedArchitectures(req.params.arch);
    if (archs.length == 0) {
      res
        .status(404)
        .send(
          `Unsupported Arch (${
            req.params.arch
          }) expecting one of ${SUPPORTED_ARCHITECTURES.join(
            ", "
          )}, univ, universal`
        );
      return;
    }
    const channel =
      getStringValueFromRequestQuery(req.query, "channel") || "stable";

    try {
      const releases = await this.findUpdateReleases(
        os,
        archs,
        version,
        channel
      );
      if (releases.length === 0) return res.status(204).send("No updates");
      const latest = releases[0];
      if (latest.version == version) return res.status(204).send("No updates");
      const assets = latest.queryAssets({ os, archs, pkg: "zip" });
      if (assets.length === 0) return res.status(204).send("No updates");
      const asset = assets[0];
      const filename = asset.filename;
      const url = `${this.getBaseUrl(req)}/dl/${filename}`;
      const notesSlice =
        releases.length === 1 ? [latest] : releases.slice(0, -1);
      const releaseNotes = mergeReleaseNotes(notesSlice, false);
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

  // Updater used by OSX (Squirrel.Mac) and others
  protected async handleUpdateOSX(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.params.version) throw new Error('Requires "version" parameter');
      if (!req.params.platform)
        throw new Error('Requires "platform" parameter');

      const mapped_platform = mapLegacyPlatform(req.params.platform);
      const platform = validateReqQueryPlatform(mapped_platform);
      const tag = req.params.version;

      const channel = req.params.channel || "stable";
      const filetype = req.query.filetype ? req.query.filetype : "zip";

      let versions = await this.versions.filter({
        versionRange: ">=" + tag,
        platform,
        channel,
      });
      if (versions.length === 0) return res.status(204).send("No updates");
      const latest = versions[0];
      if (latest.version == tag) return res.status(204).send("No updates");

      const notesSlice =
        versions.length === 1 ? [latest] : versions.slice(0, -1);
      const releaseNotes = mergeReleaseNotes(notesSlice, false);
      const url = `${this.getBaseUrl(req)}/download/version/${
        latest.version
      }/${platform}?filetype=${filetype}`;

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
    next: NextFunction
  ) {
    try {
      const _platform = req.params.platform || "windows_32";
      const mapped_platform = mapLegacyPlatform(_platform || "");
      const platform = validateReqQueryPlatform(mapped_platform);

      const channel = req.params.channel || "stable";
      const tag = req.params.version;

      if (!isPlatform(platform)) {
        throw new Error();
      }

      const versions = await this.versions.filter({
        versionRange: ">=" + tag,
        platform,
        channel,
      });
      if (versions.length === 0) throw new Error("Version not found");

      // Update needed?
      const latest = versions[0];

      // File exists
      const asset = latest.assets.find((i) => i.filename == "RELEASES");
      if (!asset) {
        throw new Error(`RELEASES File not found for ${latest.version}`);
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

      res.header("Content-Length", output.length.toString());
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
    next: NextFunction
  ) {
    try {
      const version = getVersionFromQuery(req.query);
      const releases = await this.getReleases();
      const query = { version };
      const candidates = releases.queryReleases(query);
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
    asset: PecansAssetDTO
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
