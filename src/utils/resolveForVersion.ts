import { PecansAssetDTO, PecansReleaseDTO } from "../models";
import { resolveAssetForRelease } from "../service";
import { Platform, platformToQuery } from "./platforms";
import { SupportedFileExtension } from "./SupportedFileExtension";

/**
 * @deprecated thin adapter over the ReleaseService pipeline
 * (resolveAssetForRelease), kept for API compatibility; use
 * resolveAssetForRelease with a discrete {os, arch, pkg} filter instead.
 * Will be removed in 3.0.
 */
export function resolveReleaseAssetForVersion(
  version: PecansReleaseDTO,
  platform: Platform,
  preferUniversal = true,
  wanted?: string,
): PecansAssetDTO {
  // the legacy signature typed the result non-optional even though no
  // matching asset yields undefined at runtime; preserved for compatibility
  return resolveAssetForRelease(version, {
    ...platformToQuery(platform),
    preferUniversal,
    wanted: wanted as SupportedFileExtension | undefined,
  }) as PecansAssetDTO;
}
