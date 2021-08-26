import GitHub from "octocat";
import fetch from "node-fetch";
import NodeCache from "node-cache";

import { AbstractBackend, AbstractArtifact } from "./AbstractBackend.js";
import {
  filenameToArch,
  filenameToPlatform,
  stringToVersion,
  versionToChannel,
} from "../meta.js";

export class GithubArtifact extends AbstractArtifact {
  #backend;
  #release;
  #asset;

  constructor(backend, release, asset) {
    super();

    this.#backend = backend;
    this.#release = release;
    this.#asset = asset;

    // Version
    this.platform = filenameToPlatform(asset.name);
    this.arch = filenameToArch(asset.name);
    this.version =
      stringToVersion(asset.name) || stringToVersion(release.tag_name);
    this.channel = versionToChannel(this.version);
    this.draft = release.draft;

    // Download reqs
    this.filename = this.#asset.name;
    this.size = this.#asset.size;
    this.content_type = this.#asset.content_type;
  }

  async downloadLink() {
    // FIX: this condiitional should check if the repo is public or private and send the appropriate URL based on that.
    if (!this.#backend.opts.proxyAssets)
      return this.#asset.browser_download_url;

    const url = this.#asset.url.replace(
      "https://api.github.com/",
      `https://${this.#backend.opts.token}@api.github.com/`
    );
    const res = await fetch(url, {
      heders: { Accept: "application/octet-stream" },
      redirect: "manual",
    });
    return res.headers.get("Location");
  }
}

export class GitHubBackend extends AbstractBackend {
  static CacheKeys = {
    ARTIFACTS: "artifacts",
    RELEASES: "releases",
    GITHUB_RELEASES: "githubReleases",
  };

  // node cache instance with a default 3600s TTL
  #cache;

  constructor(opts) {
    super(opts);
    const defaultOptions = {};
    this.opts = Object.assign({}, defaultOptions, opts);

    /** Validate Options */
    if (!this.opts.repository) {
      throw new Error('GitHub backend requires the "repository" options');
    }
    if ((!this.opts.username || !this.opts.password) && !this.opts.token) {
      throw new Error('GitHub backend requires "username" and "token" options');
    }

    /** Configure Cache */
    this.#cache = new NodeCache({ stdTTL: this.opts.cacheTTL || 3600 });

    /** Configure Octocat */
    const octocatOptions = {};
    if (this.opts.token) {
      octocatOptions.token = this.opts.token;
    }
    if (this.opts.endpoint) {
      octocatOptions.endpoint = this.opts.endpoint;
    }
    if (this.opts.username) {
      octocatOptions.user = this.opts.username;
    }
    if (this.opts.password) {
      octocatOptions.password = this.opts.password;
    }
    this.client = new GitHub(octocatOptions);
    this.ghrepo = this.client.repo(this.opts.repository);
  }

  async getArtifacts() {
    const cachedArtifacts = this.#cache.get(GitHubBackend.CacheKeys.ARTIFACTS);
    if (cachedArtifacts) return cachedArtifacts;

    const artifacts = [];

    const releases = await this.#getGithubReleases();
    for (const release of releases) {
      const releaseArtifacts = release.assets.map(
        (asset) => new GithubArtifact(this, release, asset)
      );
      artifacts.push(...releaseArtifacts);
    }
    this.#cache.set("artifacts", artifacts);
    return artifacts;
  }

  async getReleases() {
    const cachedRelases = this.#cache.get(GitHubBackend.CacheKeys.RELEASES);
    if (cachedRelases) return cachedRelases;

    const releases = {};
    const githubReleases = await this.#getGithubReleases();
    for (const githubRelease of githubReleases) {
      const version = stringToVersion(githubRelease.tag_name);
      const artifacts = githubRelease.assets.map(
        (asset) => new GithubArtifact(release, asset)
      );
      releases[version] = {
        notes: githubRelease.body || "",
        version,
        artifacts,
      };
    }
    console.log({ release });
    this.#cache.set(GitHubBackend.CacheKeys.RELEASES, releases);
  }

  async #getGithubReleases() {
    const cachedGithubRelases = this.#cache.get(
      GitHubBackend.CacheKeys.GITHUB_RELEASES
    );
    if (cachedGithubRelases) return cachedGithubRelases;

    const page = await this.ghrepo.releases();
    const releases = await page.all();
    this.#cache.set("githubReleases", releases);
    return releases;
  }

  async refreshArtifacts() {
    this.#cache.delete(GitHubBackend.CacheKeys.GITHUB_RELEASES);
    this.#cache.delete(GitHubBackend.CacheKeys.RELEASES);
    this.#cache.delete(GitHubBackend.CacheKeys.ARTIFACTS);
    const releases = await this.getReleases();
    const artifacts = await this.getArtifacts();
    return { releases, artifacts };
  }
}
