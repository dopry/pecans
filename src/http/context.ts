import type { Request, Response } from "express";
import type { PecansAssetDTO } from "../models/PecansAsset.js";
import {
  PecansRelease,
  type PecansReleaseDTO,
} from "../models/PecansRelease.js";
import type { PecansReleaseQuery } from "../models/PecansReleaseQuery.js";
import { PecansReleases } from "../models/PecansReleases.js";
import { ReleaseService } from "../service.js";

/**
 * The capabilities route handlers need from the composition root. Pecans
 * builds one over itself, keeping the EventEmitter (before/afterDownload)
 * and backend wiring on the class while the handlers live in this module's
 * siblings as plain functions.
 */
export interface PecansHttpContext {
  /** Unified resolution pipeline shared by all route handlers. */
  service: ReleaseService;
  /** The backend's (cached) release collection. */
  getReleases(): Promise<PecansReleases>;
  /** Strict structural query, routed through Pecans.queryReleases so host
   * overrides of that public method keep applying. */
  queryReleases(query: PecansReleaseQuery): Promise<PecansRelease[]>;
  /** Host-facing base url, honoring the configured basePath. */
  getBaseUrl(req: Request): string;
  /** Serve an asset through the backend, emitting before/afterDownload. */
  serveAsset(
    req: Request,
    res: Response,
    release: PecansReleaseDTO,
    asset: PecansAssetDTO,
  ): Promise<void>;
  /** Read an asset's content through the backend (RELEASES manifest). */
  readAsset(asset: PecansAssetDTO): Promise<Buffer>;
  /** Seconds since the server started (GET /api/status). */
  uptimeSeconds(): number;
  /** Throws NotFoundError unless the channel exists. */
  validateChannelName(name: string): Promise<void>;
  /** Include versions in aggregated release notes (Squirrel.Mac updates). */
  includeVersionInReleaseNotes(): boolean;
}
