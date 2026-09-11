import type { NextFunction, Request, Response } from "express";
import { gt, valid } from "semver";
import { BadRequestError, NotFoundError } from "../errors.js";
import { mergeReleaseNotes } from "../utils/mergeReleaseNotes.js";
import { filetypeToPackageFormat } from "../utils/PackageFormat.js";
import { mapLegacyPlatform, platformToQuery } from "../utils/platforms.js";
import { generateRELEASES, parseRELEASES } from "../utils/win-releases.js";
import type { PecansHttpContext } from "./context.js";
import { getStringParam, validateReqQueryPlatform } from "./query.js";

/**
 * GET /update/:platform/:version (+ channel variant) - Squirrel.Mac update
 * feed: 204 when current, 200 {url, name, notes, pub_date} when an update
 * exists. The response shape is a frozen client contract.
 * opts.forcedFiletype pins the feed to one asset filetype; without it the
 * feed serves the squirrel zip contract. The /update/:platform/msix/:version
 * format route forces "msix".
 */
export function createUpdateOSXHandler(
  ctx: PecansHttpContext,
  opts: { forcedFiletype?: string } = {},
) {
  return async (req: Request, res: Response, next: NextFunction) => {
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
      // normalized, so "v2.5.0" and "2.5.0+build.1" compare as 2.5.0 below
      const tag = valid(versionParam);
      if (!tag) {
        throw new BadRequestError(
          `Invalid version (${versionParam}), expected a specific semver version`,
        );
      }

      // a channel named in the path must exist: an unknown one is a 404,
      // never "you are current", or a typo in the feed url looks to the
      // client like an app that never needs updating (#87). "*" names every
      // channel rather than one, so there is nothing to look up.
      const channelParam = getStringParam(req, "channel");
      if (channelParam && channelParam !== "*") {
        await ctx.validateChannelName(channelParam);
      }
      const channel = channelParam || "stable";
      // the nuts-era ?filetype query on /update was removed in 2.0 in favor
      // of the update.electronjs.org format segment
      // (/update/:platform/:format/:version); the feed serves the squirrel
      // zip contract unless a format route forces another filetype.
      // Lowercase because the download route's filetype validation is
      // case-sensitive and the feed url embeds this value.
      const filetype = (opts.forcedFiletype || "zip").toLowerCase();
      // an msix filetype implies the msix package format: the msix format
      // route serves this same Squirrel.Mac-shaped feed pinned to msix
      // assets, which never match the platform default
      const pkg = filetypeToPackageFormat(filetype);

      const versions = await ctx.service.filterReleases({
        ...platformToQuery(platform),
        ...(pkg ? { pkg } : {}),
        version: ">=" + tag,
        channel,
        // legacy behavior: the update surface always widened osx queries to
        // universal builds, regardless of opts.preferUniversal
        preferUniversal: true,
      });
      if (versions.length === 0) return res.status(204).send("No updates");
      const latest = versions[0];
      if (latest.version == tag) return res.status(204).send("No updates");

      // notes cover the releases newer than the client: its own release is
      // not always the last entry (it may have no release, or none on this
      // channel), and semver comparison ignores how a version is spelled
      const notesSlice = versions.filter((release) => gt(release.version, tag));
      const url = `${ctx.getBaseUrl(req)}/download/version/${
        latest.version
      }/${platform}?filetype=${encodeURIComponent(filetype)}`;
      const releaseNotes = mergeReleaseNotes(
        notesSlice,
        ctx.includeVersionInReleaseNotes(),
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
  };
}

/**
 * GET /update/:platform/:version/RELEASES (+ channel variant) -
 * Squirrel.Windows manifest with download URLs rewritten through /dl. The
 * byte-exact RELEASES format is a frozen client contract.
 */
export function createUpdateWinHandler(ctx: PecansHttpContext) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const _platform = getStringParam(req, "platform") || "";
      const mapped_platform = mapLegacyPlatform(_platform);
      const platform = validateReqQueryPlatform(mapped_platform);

      // as on the Squirrel.Mac feed, a channel named in the path must
      // exist, so a typo is a clear 404 rather than "Version not found"
      const channelParam = getStringParam(req, "channel");
      if (channelParam && channelParam !== "*") {
        await ctx.validateChannelName(channelParam);
      }
      const channel = channelParam || "stable";
      const tag = getStringParam(req, "version");
      if (!tag) throw new BadRequestError('Requires "version" parameter');
      // the client reports its installed version, so require a specific
      // semver version; a range would corrupt the ">=" + tag filter below
      if (!valid(tag)) {
        throw new BadRequestError(
          `Invalid version (${tag}), expected a specific semver version`,
        );
      }

      const versions = await ctx.service.filterReleases({
        ...platformToQuery(platform),
        version: ">=" + tag,
        channel,
        // legacy behavior: the update surface always widened osx queries to
        // universal builds, regardless of opts.preferUniversal
        preferUniversal: true,
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

      const content = await ctx.readAsset(asset);
      let releases = await parseRELEASES(content.toString("utf-8"));
      releases = releases
        // Change filename to use download proxy
        .map((entry) => {
          entry.filename = ctx.getBaseUrl(req) + "/dl/" + entry.filename;
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
  };
}

/**
 * GET /update/:platform/:format/:version - update.electronjs.org-compatible
 * format segment. "squirrel" serves the standard Squirrel.Mac-shaped feed;
 * "msix" serves the same feed constrained to msix assets (Electron's
 * built-in MSIX updater, 39.5+/40.2+/41+, consumes the Squirrel.Mac JSON
 * shape). Anything else is a 404.
 */
export function createUpdateFormatHandler(ctx: PecansHttpContext) {
  const squirrel = createUpdateOSXHandler(ctx);
  const msix = createUpdateOSXHandler(ctx, { forcedFiletype: "msix" });
  return async (req: Request, res: Response, next: NextFunction) => {
    const format = getStringParam(req, "format")?.toLowerCase();
    if (format === "squirrel") return squirrel(req, res, next);
    if (format === "msix") return msix(req, res, next);
    next(
      new NotFoundError(
        `Unsupported update format (${format}), expected squirrel or msix`,
      ),
    );
  };
}

/**
 * GET /update/:platform/:format/:version/RELEASES - the Squirrel.Windows
 * manifest under the update.electronjs.org-compatible format segment.
 * Squirrel.Windows appends /RELEASES to its feed url itself, so only the
 * "squirrel" format exists here (MSIX has no RELEASES manifest).
 */
export function createUpdateFormatWinHandler(ctx: PecansHttpContext) {
  const win = createUpdateWinHandler(ctx);
  return async (req: Request, res: Response, next: NextFunction) => {
    const format = getStringParam(req, "format")?.toLowerCase();
    if (format === "squirrel") return win(req, res, next);
    next(
      new NotFoundError(
        `Unsupported update format (${format}) for RELEASES, expected squirrel`,
      ),
    );
  };
}
