import { Octokit } from "@octokit/rest";
import type { Endpoints } from "@octokit/types";
import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";
import { Readable } from "node:stream";
import type { NextFunction, Request, Response } from "express";
import { Backend, type BackendOpts, BackendSettings } from "./backend.js";
import {
  PecansAsset,
  type PecansAssetDTO,
  PecansRelease,
  type PecansReleaseDTO,
  isPecansAsset,
} from "../models/index.js";
// keep the module graph cycle-free: import specific util modules rather
// than the ../utils barrel
import { filenameToPlatform } from "../utils/platforms.js";
import { PecansReleases } from "../models/PecansReleases.js";
import { clean } from "semver";

// see: https://docs.github.com/en/rest/releases/releases
export type GithubReleaseAsset =
  Endpoints["GET /repos/{owner}/{repo}/releases/assets/{asset_id}"]["response"]["data"];

// see: https://docs.github.com/en/rest/releases/releases
export type GithubRelease =
  Endpoints["GET /repos/{owner}/{repo}/releases/latest"]["response"]["data"];

export interface PecansGitHubBackendOpts extends BackendOpts {
  baseUrl?: string;
  proxyAssets?: boolean;
}

export class PecansGitHubBackendSettings
  extends BackendSettings
  implements PecansGitHubBackendOpts
{
  baseUrl?: string;
  proxyAssets = true;
}

export interface PecansGithubBackendEnvironment {
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_TOKEN?: string;
}

// typed raw payload: assets created by this backend carry the GitHub API
// asset object, read back in serveAsset/getAssetStream
export class PecansGitHubBackend extends Backend<GithubReleaseAsset> {
  protected opts: PecansGitHubBackendSettings;
  protected octokit: Octokit;

  static getEnvironment(prefix?: string): PecansGithubBackendEnvironment {
    const ownerEnv = prefix ? `${prefix}_GITHUB_OWNER` : "GITHUB_OWNER";
    const GITHUB_OWNER = process.env[ownerEnv];

    const repoEnv = prefix ? `${prefix}_GITHUB_REPO` : "GITHUB_REPO";
    const GITHUB_REPO = process.env[repoEnv];

    const tokenEnv = prefix ? `${prefix}_GITHUB_TOKEN` : "GITHUB_TOKEN";
    const GITHUB_TOKEN = process.env[tokenEnv];

    if (!GITHUB_OWNER) {
      throw new Error(`${ownerEnv} environment variable is required.`);
    }
    if (!GITHUB_REPO) {
      throw new Error(`${repoEnv} environment variable is required.`);
    }
    if (!GITHUB_TOKEN) {
      console.warn(
        `${tokenEnv} environment variable was not provided, if your repo is private you will need to provide a token.`,
      );
    }
    const env = {
      GITHUB_OWNER,
      GITHUB_REPO,
      GITHUB_TOKEN,
    };
    // console.log(
    //   {
    //     GITHUB_OWNER,
    //     GITHUB_REPO,
    //     GITHUB_TOKEN:
    //       GITHUB_TOKEN &&
    //       GITHUB_TOKEN.substring(0, 4) +
    //         "******" +
    //         GITHUB_TOKEN?.substring(GITHUB_TOKEN.length - 6),
    //   } || "No Github Token"
    // );
    return env;
  }

  static FromEnv(
    env: PecansGithubBackendEnvironment,
    opts: PecansGitHubBackendOpts = {},
  ): PecansGitHubBackend {
    return new PecansGitHubBackend(
      env.GITHUB_OWNER,
      env.GITHUB_REPO,
      env.GITHUB_TOKEN,
      opts,
    );
  }

  constructor(
    protected owner: string,
    protected repo: string,
    protected token?: string,
    opts: PecansGitHubBackendOpts = {},
  ) {
    if (!owner) {
      throw new Error("Github Owner Required");
    }
    if (!repo) {
      throw new Error("Github Repo Required");
    }
    if (!token) {
      console.warn("Github Token not provided, ensure the repo is public");
    }
    super(opts);

    this.opts = Object.assign({}, new PecansGitHubBackendSettings(), opts);
    const { baseUrl = undefined } = opts;

    const octokitOptions = {
      auth: token,
      baseUrl,
      userAgent: "Pecans Github Backend",
    };
    this.octokit = new Octokit(octokitOptions);
  }

  getRefreshWebhookMiddleware(
    path: string,
  ): (req: Request, res: Response, next: NextFunction) => void {
    // provide a no-op if no secret provided.
    if (!this.opts.refreshSecret) {
      return (req: Request, res: Response, next: NextFunction) => next();
    }
    // handle github webhooks authentication and event parsing.
    const webhook = new Webhooks({
      secret: this.opts.refreshSecret,
    });
    // Webhook from GitHub
    webhook.on("release", () => {
      this.refreshCache();
    });
    return createNodeMiddleware(webhook, { path });
  }

  // Implement fetchReleases abstract method from Backend class
  async fetchReleases(): Promise<PecansReleases> {
    const { owner, repo } = this;

    // const reponse = await this.octokit.rest.repos.listReleases({ owner, repo });
    // console.debug({ data: reponse.data });
    const releases = await this.octokit.paginate(
      this.octokit.rest.repos.listReleases,
      { owner, repo },
    );

    const publishedReleases = releases.filter((releases) => {
      return releases.draft === false;
    });

    const normalizedReleases = publishedReleases.map((release) =>
      this.normalizeRelease(release),
    );
    const pecansReleases = new PecansReleases(normalizedReleases);
    return pecansReleases;
  }

  // Return stream for an asset
  async serveAsset(
    asset: PecansAssetDTO<GithubReleaseAsset>,
    res: Response,
  ): Promise<void> {
    if (!this.opts.proxyAssets) {
      // raw is this backend's private payload: the GitHub API asset object
      const downloadUrl = asset.raw?.browser_download_url;
      if (!downloadUrl) {
        throw new Error(
          `Asset ${asset.id} has no browser_download_url in its raw payload`,
        );
      }
      res.redirect(downloadUrl);
      return;
    } else {
      // native fetch follows redirects by default; "manual" returns the 302 so
      // we can hand the caller the limited-use download URL from the Location
      // header.
      const redirect = "manual";
      const headers: Record<string, string> = {
        Accept: "application/octet-stream",
      };
      if (this.token) {
        headers["Authorization"] = `token ${this.token}`;
      }
      const options: RequestInit = { headers, redirect };
      // raw is this backend's private payload: the GitHub API asset object
      const apiUrl = asset.raw?.url;
      if (!apiUrl) {
        throw new Error(`Asset ${asset.id} has no url in its raw payload`);
      }
      // get private url from github.
      const assetRes = await fetch(apiUrl, options);
      const location = assetRes.headers.get("Location");
      if (location !== null) {
        // redirect user to limited use download url.
        res.redirect(location);
        return;
      }
      throw new Error(
        `Unable to resolve download location for asset ${asset.id} ` +
          `(${apiUrl}): HTTP ${assetRes.status} without a Location header`,
      );
    }
  }
  // Return stream for an asset
  async getAssetStream(
    asset: PecansAssetDTO<GithubReleaseAsset>,
  ): Promise<NodeJS.ReadableStream | null> {
    const headers: Record<string, string> = {
      "User-Agent": "pecans",
      Accept: "application/octet-stream",
    };

    if (this.token) {
      headers["Authorization"] = `token ${this.token}`;
    }

    // raw is this backend's private payload: the GitHub API asset object
    const url = asset.raw?.url;
    if (!url) {
      throw new Error(`Asset ${asset.id} has no url in its raw payload`);
    }
    const opts: RequestInit = {
      method: "get",
      headers: headers,
    };
    const response = await fetch(url, opts);
    // native fetch resolves `body` to a web ReadableStream; wrap it as a Node
    // Readable so callers (readAsset's stream.pipeline) keep working unchanged.
    return response.body ? Readable.fromWeb(response.body) : null;
  }

  normalizeRelease(release: GithubRelease): PecansRelease {
    const version =
      clean(release.tag_name, { loose: true }) || release.tag_name;
    const notes = release.body || "";
    const published_at = release.published_at
      ? new Date(release.published_at)
      : new Date(99999, 12, 31);
    const valid_assets = release.assets.filter((asset) => {
      try {
        return filenameToPlatform(asset.name) != null;
      } catch (err) {
        console.error(err);
        return false;
      }
    });
    const assets = valid_assets
      .map((asset) => {
        try {
          return this.normalizeAsset(asset);
        } catch (err) {
          console.log("failed to normalize asset", err);
          return undefined;
        }
      })
      // explicit type arg so the guard keeps the typed raw payload
      .filter(isPecansAsset<GithubReleaseAsset>);
    const dto: PecansReleaseDTO = {
      version,
      notes,
      published_at,
      assets,
    };
    return new PecansRelease(dto);
  }

  normalizeAsset(asset: GithubReleaseAsset): PecansAsset<GithubReleaseAsset> {
    const id = asset.id.toString();
    const filename = asset.name;
    const type = filenameToPlatform(filename);
    const size = asset.size;
    const content_type = asset.content_type;
    const raw = asset;
    const dto = {
      id,
      filename,
      type,
      size,
      content_type,
      raw,
    };
    return new PecansAsset(dto);
  }
}
