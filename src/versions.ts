import { Backend } from "./backends/";
import { NotFoundError, UnsupportedPlatformError } from "./errors";
import { PecansRelease } from "./models/PecansRelease";
import { ReleaseService } from "./service";
import { isPlatform, Platform, platformToQuery } from "./utils";

export type PlatformQuery = Platform | undefined;

export interface VersionFilterOpts {
  /** latest or a semver range, see: https://github.com/npm/node-semver#ranges, defaults to latest */
  versionRange?: string;
  /** * or  a channel name, defaults to stable */
  channel?: string;
  /** defaults to undefined */
  platform?: Platform;
  /** Should we prioritize Universal build over x64/arm64? Default to true */
  preferUniversal?: boolean;
}

/**
 * @deprecated thin adapter over ReleaseService, kept for API compatibility;
 * use ReleaseService with discrete {os, arch, pkg} queries instead. Will be
 * removed in 3.0.
 */
export class Versions {
  static filterDefaults: VersionFilterOpts = {
    versionRange: "latest",
    platform: undefined,
    channel: "stable",
    preferUniversal: true,
  };

  protected service: ReleaseService;

  constructor(protected backend: Backend) {
    this.service = new ReleaseService(backend);
  }

  // Filter versions with criteria
  async filter(opts: VersionFilterOpts): Promise<PecansRelease[]> {
    const _opts: VersionFilterOpts = Object.assign(
      {},
      Versions.filterDefaults,
      opts,
    );

    if (_opts.platform !== undefined && !isPlatform(_opts.platform)) {
      throw new UnsupportedPlatformError(_opts.platform);
    }

    // legacy composite platform ids translate to the discrete model at the
    // adapter boundary; the service only speaks {os, arch, pkg}
    const platform = _opts.platform ? platformToQuery(_opts.platform) : {};
    return this.service.filterReleases({
      ...platform,
      channel: _opts.channel,
      version: _opts.versionRange,
      preferUniversal: _opts.preferUniversal,
    });
  }

  //  Get a specific version by its tag
  async get(tag: string) {
    return this.resolve({ versionRange: tag });
  }

  async list() {
    return this.service.list();
  }

  // Resolve a platform, by filtering then taking the first result
  async resolve(opts: VersionFilterOpts) {
    const versions = await this.filter(opts);
    if (versions.length === 0)
      throw new NotFoundError("Release not found: " + JSON.stringify(opts));

    const version = versions[0];
    return version;
  }
}
