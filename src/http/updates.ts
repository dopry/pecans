import { NextFunction, Request, Response } from "express";
import { valid } from "semver";
import { BadRequestError, NotFoundError } from "../errors";
import { mergeReleaseNotes } from "../utils/mergeReleaseNotes";
import { mapLegacyPlatform, platformToQuery } from "../utils/platforms";
import { generateRELEASES, parseRELEASES } from "../utils/win-releases";
import { PecansHttpContext } from "./context";
import { getStringParam, validateReqQueryPlatform } from "./query";

/** GET /update - @deprecated redirect to /update/:platform/:version. */
export function handleUpdateRedirect(
  ctx: PecansHttpContext,
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

/**
 * GET /update/:platform/:version (+ channel variant) - Squirrel.Mac update
 * feed: 204 when current, 200 {url, name, notes, pub_date} when an update
 * exists. The response shape is a frozen client contract.
 */
export async function handleUpdateOSX(
  ctx: PecansHttpContext,
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

    const versions = await ctx.service.filterReleases({
      ...platformToQuery(platform),
      version: ">=" + tag,
      channel,
      // legacy behavior: the update surface always widened osx queries to
      // universal builds, regardless of opts.preferUniversal
      preferUniversal: true,
    });
    if (versions.length === 0) return res.status(204).send("No updates");
    const latest = versions[0];
    if (latest.version == tag) return res.status(204).send("No updates");

    const notesSlice = versions.length === 1 ? [latest] : versions.slice(0, -1);
    const url = `${ctx.getBaseUrl(req)}/download/version/${
      latest.version
    }/${platform}?filetype=${filetype}`;
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
}

/**
 * GET /update/:platform/:version/RELEASES (+ channel variant) -
 * Squirrel.Windows manifest with download URLs rewritten through /dl. The
 * byte-exact RELEASES format is a frozen client contract.
 */
export async function handleUpdateWin(
  ctx: PecansHttpContext,
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
      throw new NotFoundError(`RELEASES File not found for ${latest.version}`);
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
}
