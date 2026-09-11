import type { NextFunction, Request, Response } from "express";
import { validRange } from "semver";
import { BadRequestError, NotFoundError } from "../errors.js";
import { formatReleaseNote } from "../utils/mergeReleaseNotes.js";
import type { PecansHttpContext } from "./context.js";
import {
  getStringParam,
  getVersionFromQuery,
  validateReqQueryChannel,
} from "./query.js";

/** GET /notes{/:version} - release notes as JSON or plain text.
 * Defaults to the stable channel; ?channel=<name|*> selects another. */
export function createNotesHandler(ctx: PecansHttpContext) {
  return async (req: Request, res: Response, next: NextFunction) => {
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

      // notes default to stable so a newer prerelease does not answer for
      // the latest release (#84). An explicitly requested channel is
      // honored strictly, as on /download: no match means 404, never a
      // fallback that hands prerelease notes to stable users (#15). An
      // empty ?channel= names no channel, so || is deliberate.
      const requestedChannel = req.query.channel || undefined;
      const channelExplicit = requestedChannel !== undefined;
      let channel = validateReqQueryChannel(requestedChannel ?? "stable");
      // asking for a specific version is asking for that release's notes,
      // whatever channel it is on; an explicit channel still narrows it
      if (!channelExplicit && version && version !== "latest") channel = "*";

      const releases = await ctx.getReleases();
      let candidates = releases.queryReleases({ version, channel });
      // only the defaulted channel falls back to every channel, matching
      // the bare /download/:platform route
      if (candidates.length === 0 && !channelExplicit && channel !== "*") {
        candidates = releases.queryReleases({ version, channel: "*" });
      }
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
  };
}
