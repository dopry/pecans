import type { NextFunction, Request, Response } from "express";
import { valid } from "semver";
import { BadRequestError, NotFoundError } from "../errors.js";
import type { PecansRelease } from "../models/PecansRelease.js";
import type { PecansReleaseQuery } from "../models/PecansReleaseQuery.js";
import {
  OPERATING_SYSTEMS,
  isOperatingSystem,
} from "../utils/OperatingSystem.js";
import { isValidArchForOS } from "../utils/Architecture.js";
import {
  filetypeToPackageFormat,
  getPkgFromQuery,
} from "../utils/PackageFormat.js";
import {
  filenameToPlatform,
  mapLegacyPlatform,
  platformToQuery,
} from "../utils/platforms.js";
import { getDownloadExtensionsByOs } from "../utils/SupportedFileExtension.js";
import type { PecansHttpContext } from "./context.js";
import {
  getFiletypeFromQuery,
  getStringParam,
  getVersionFromQuery,
  validateReqQueryChannel,
  validateReqQueryPlatform,
  validateReqQueryTag,
} from "./query.js";

/** GET /download/** - legacy composite-platform download routes. */
export function createDownloadHandler(ctx: PecansHttpContext) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // an explicitly requested channel (path segment or ?channel=) is
      // honored strictly: no matching release means 404, never a silent
      // fallback that hands prerelease builds to stable users (#15). Only
      // the defaulted channel on bare /download/:platform links keeps the
      // legacy any-channel fallback. An empty ?channel= (typically an
      // unpopulated template variable) names no channel, so || is
      // deliberate: it is treated as absent, not as an explicit request.
      const requestedChannel =
        getStringParam(req, "channel") || req.query.channel || undefined;
      const channelExplicit = requestedChannel !== undefined;
      let channel = validateReqQueryChannel(requestedChannel ?? "stable");
      const tag = validateReqQueryTag(
        getStringParam(req, "tag") ?? req.query.tag,
      );
      const filename = getStringParam(req, "filename");
      const filetype = getFiletypeFromQuery(req.query);

      // platform autodetection from the user agent was removed in 2.0;
      // selecting a platform is the client's responsibility
      let _platform: string | undefined;
      if (filename) {
        try {
          _platform = filenameToPlatform(filename);
        } catch (err) {
          // a client-supplied filename that doesn't parse to a platform is
          // a client error, not a server fault (it was a 500 before)
          throw new BadRequestError(
            err instanceof Error ? err.message : String(err),
          );
        }
      } else {
        _platform = getStringParam(req, "platform");
      }
      if (!_platform) {
        throw new BadRequestError(
          "Platform is required. Specify a platform in the URL, e.g. /download/osx_64.",
        );
      }
      const platform = validateReqQueryPlatform(mapLegacyPlatform(_platform));
      // legacy composite ids translate to the discrete model at the HTTP
      // edge; everything below resolves through the ReleaseService pipeline.
      // An msix filetype implies the msix package format, since msix assets
      // never match a composite id's "default" package constraint. An
      // explicit filename already identifies the asset (and its pkg), so a
      // stray ?filetype must not constrain release resolution there.
      const filetypePkg = filename
        ? undefined
        : filetypeToPackageFormat(filetype);
      const platformQuery = {
        ...platformToQuery(platform),
        ...(filetypePkg ? { pkg: filetypePkg } : {}),
      };

      // An exact version identifies one release, so it is not channel-bound.
      // A range is not: it resolves within the requested channel, or the
      // default one with the fallback below (#85). An absent tag means
      // "latest" and keeps the requested/default channel.
      if (tag && tag != "latest" && valid(tag)) channel = "*";

      let release: PecansRelease | undefined = undefined;
      try {
        release = await ctx.service.resolveRelease({
          ...platformQuery,
          channel: channel,
          version: tag ?? "latest",
        });
      } catch (err) {
        // only a missing release triggers the fallback - operational
        // failures must propagate, not be masked by the retry. And don't
        // fall back at all if we already searched every channel (a specific
        // tag widened channel to "*" above) or if the caller explicitly
        // requested this channel (#15)
        if (
          channel == "*" ||
          channelExplicit ||
          !(err instanceof NotFoundError)
        ) {
          throw err;
        }
      }

      // we weren't able to find a release with the specified channel
      // try again without the channel restriction
      if (!release) {
        release = await ctx.service.resolveRelease({
          ...platformQuery,
          channel: "*",
          version: tag ?? "latest",
        });
      }

      const asset = filename
        ? release.assets.find((i) => i.filename == filename)
        : ctx.service.resolveAsset(release, {
            ...platformQuery,
            wanted: filetype,
          });

      if (!asset)
        throw new NotFoundError(
          `No download available for platform ${platform} for version ${release.version} (${channel})`,
        );

      // Call analytic middleware, then serve; await so rejections reach the
      // catch below instead of orphaning the promise
      await ctx.serveAsset(req, res, release, asset);
    } catch (err) {
      next(err);
    }
  };
}

/** GET /dl/:os/:arch - discrete-model download route. */
export function createDlHandler(ctx: PecansHttpContext) {
  return async (req: Request, res: Response, next: NextFunction) => {
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
      await ctx.validateChannelName(channel);
      const version = getVersionFromQuery(req.query);
      const pkg = getPkgFromQuery(req.query);

      const releaseQuery: PecansReleaseQuery = {
        channel,
        os,
        arch,
        version,
        pkg,
      };

      const releases = await ctx.queryReleases(releaseQuery);
      if (releases.length == 0) {
        throw new NotFoundError("No Matching Releases Found");
      }
      // releases are sorted in version descending order so the first element
      // should be the highest version that matched the query
      const release = releases[0];
      const extensions = getDownloadExtensionsByOs(os, pkg);
      const assetQuery = { arch, version, pkg, extensions };
      const matchingAssets = release.queryAssets(assetQuery);

      if (matchingAssets.length == 0) {
        throw new NotFoundError("No Matching Assets Found");
      }

      const asset = matchingAssets[0];
      await ctx.serveAsset(req, res, release, asset);
    } catch (e) {
      next(e);
    }
  };
}

/** GET /dl/:filename - download a release asset by exact filename. */
export function createDlFilenameHandler(ctx: PecansHttpContext) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filename = getStringParam(req, "filename");
      // an absent filename must not fall through to queryReleases, where an
      // undefined filename matches every release
      if (!filename) {
        throw new BadRequestError("filename is required");
      }
      const query = { filename };
      const releases = await ctx.getReleases();
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
      await ctx.serveAsset(req, res, release, asset);
    } catch (err) {
      next(err);
    }
  };
}
