import { Octokit } from "@octokit/rest";
import { Endpoints } from "@octokit/types";
import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";
import fetch, { RequestInfo, RequestInit } from "node-fetch";
import { NextFunction, Request, Response } from "express";
import { Backend, BackendOpts, BackendSettings } from "./backend";
import {
  PecansAsset,
  PecansAssetDTO,
  PecansRelease,
  PecansReleaseDTO,
  isPecansAsset,
} from "../models";
import { channelFromVersion, filenameToPlatform } from "../utils/";
import { PecansReleases } from "../models/PecansReleases";
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

export class PecansGitHubBackend extends Backend {
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
        `${tokenEnv} environment variable was not provided, if your repo is private you will need to provide a token.`
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

  static FromEnv(env: PecansGithubBackendEnvironment): PecansGitHubBackend {
    return new PecansGitHubBackend(
      env.GITHUB_OWNER,
      env.GITHUB_REPO,
      env.GITHUB_TOKEN
    );
  }

  constructor(
    protected owner: string,
    protected repo: string,
    protected token?: string,
    opts: PecansGitHubBackendOpts = {}
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
      request: {
        fetch: fetch,
      },
    };
    this.octokit = new Octokit(octokitOptions);
  }

  getRefreshWebhookMiddleware(
    path: string
  ): (req: Request, res: Response, next: NextFunction) => void {
    // provide a no-op if no secret provided.
    if (!this.opts.refreshSecret) {
      return (req: Request, res: Response, next: NextFunction) => next();
    }
    const webhook = new Webhooks({
      secret: this.opts.refreshSecret,
    });
    // Webhook from GitHub
    webhook.on("release", () => {
      this.onRelease();
    });
    return createNodeMiddleware(webhook, { path });
  }

  // List all releases for this repository
  async releases() {
    const { owner, repo } = this;

    // const reponse = await this.octokit.rest.repos.listReleases({ owner, repo });
    // console.debug({ data: reponse.data });
    const releases = await this.octokit.paginate(
      this.octokit.rest.repos.listReleases,
      { owner, repo }
    );

    const publishedReleases = releases.filter((releases) => {
      return releases.draft === false;
    });

    const normalizedReleases = publishedReleases.map((release) =>
      this.normalizeRelease(release)
    );
    const pecansReleases = new PecansReleases(normalizedReleases);
    return pecansReleases;
  }

  // Return stream for an asset
  async serveAsset(asset: PecansAssetDTO, res: Response): Promise<void> {
    if (!this.opts.proxyAssets) {
      res.redirect(asset.raw.browser_download_url);
      return;
    } else {
      const redirect = "manual";
      const headers = { Accept: "application/octet-stream" };
      const options: RequestInit = { headers, redirect };
      const finalUrl = asset.raw.url.replace(
        "https://api.github.com/",
        `https://${this.token}@api.github.com/`
      );
      // get private url from github.
      const assetRes = await fetch(finalUrl, options);
      const location = assetRes.headers.get("Location");
      if (location !== null) {
        // redirect user to limited use download url.
        res.redirect(location);
        return;
      }
      throw new Error("Unable to load asset url");
    }
  }
  // Return stream for an asset
  async getAssetStream(
    asset: PecansAssetDTO
  ): Promise<NodeJS.ReadableStream | null> {
    const headers: Record<string, string> = {
      "User-Agent": "pecans",
      Accept: "application/octet-stream",
    };

    if (this.token) {
      headers["Authorization"] = `token ${this.token}`;
    }

    const url: RequestInfo = asset.raw.url;
    const opts: RequestInit = {
      method: "get",
      headers: headers,
    };
    const response = await fetch(url, opts);
    return response.body;
  }

  normalizeRelease(release: GithubRelease): PecansRelease {
    const version =
      clean(release.tag_name, { loose: true }) || release.tag_name;
    const channel = channelFromVersion(version);
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
      .filter(isPecansAsset);
    const dto: PecansReleaseDTO = {
      version,
      channel,
      notes,
      published_at,
      assets,
    };
    return new PecansRelease(dto);
  }

  normalizeAsset(asset: GithubReleaseAsset): PecansAsset {
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

// @deprecated
export class GitHubBackend extends PecansGitHubBackend {
  constructor(
    protected token: string,
    protected owner: string,
    protected repo: string,
    opts: PecansGitHubBackendOpts = {}
  ) {
    console.warn(
      "GitHubBackend has been deprecated in favor of the namespaced PecansGithubBackend"
    );
    if (!token) {
      throw new Error("Github Token Required");
    }
    if (!owner) {
      throw new Error("Github Owner Required");
    }
    if (!repo) {
      throw new Error("Github Repo Required");
    }
    super(owner, repo, token, opts);
  }
}
