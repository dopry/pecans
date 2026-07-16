import { NextFunction, Request, Response } from "express";
import { validRange } from "semver";
import { BadRequestError, NotFoundError } from "../errors";
import { formatReleaseNote } from "../utils/mergeReleaseNotes";
import { PecansHttpContext } from "./context";
import { getStringParam, getVersionFromQuery } from "./query";

/** GET /notes{/:version} - release notes as JSON or plain text. */
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
      const releases = await ctx.getReleases();
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
  };
}
