import type { NextFunction, Request, Response } from "express";
import { platformToQuery } from "../utils/platforms.js";
import type { PecansHttpContext } from "./context.js";
import {
  getPlatformFromQuery,
  getVersionFromQuery,
  validateReqQueryChannel,
} from "./query.js";

/** GET /api/channels - release channels with their latest versions. */
export function createApiChannelsHandler(ctx: PecansHttpContext) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const releases = await ctx.getReleases();
      // public shape only: the full PecansChannel embeds every release (and
      // latest_release) recursively, which bloats the payload; module
      // consumers keep the rich objects via getChannels()
      const channels = releases.getChannels().map((channel) => ({
        name: channel.name,
        latest: channel.latest,
        versions_count: channel.versions_count,
        published_at: channel.published_at,
      }));
      res.json(channels);
    } catch (err) {
      next(err);
    }
  };
}

/** GET /api/status - server uptime. */
export function createApiStatusHandler(ctx: PecansHttpContext) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.send({ uptime: ctx.uptimeSeconds() });
    } catch (err) {
      next(err);
    }
  };
}

/** GET /api/versions - releases filtered by ?channel ?platform ?version. */
export function createApiVersionsHandler(ctx: PecansHttpContext) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const channel = validateReqQueryChannel(req.query.channel || "*");
      const platform = getPlatformFromQuery(req.query);
      const version = getVersionFromQuery(req.query);

      const versions = await ctx.service.filterReleases({
        ...(platform ? platformToQuery(platform) : {}),
        channel,
        version,
        // legacy behavior: this surface always widened osx queries to
        // universal builds, regardless of opts.preferUniversal
        preferUniversal: true,
      });
      res.send(versions);
    } catch (err) {
      next(err);
    }
  };
}
