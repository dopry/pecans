import { Architecture, OperatingSystem, PackageFormat } from "../utils";
import { SupportedFileExtension } from "../utils/SupportedFileExtension";

/**
 * Package-format criterion. An asset's pkg is undefined for the platform's
 * default package (tarball, dmg, setup.exe) and set for alternate formats
 * (deb, rpm). Queries are unconstrained when pkg is omitted; "default"
 * selects only default-package assets.
 */
export type PackageFormatQuery = PackageFormat | "default";

export interface PecansAssetQuery {
  os?: OperatingSystem;
  arch?: Architecture;
  /** undefined = any package format; "default" = the platform default only */
  pkg?: PackageFormatQuery;
  filename?: string;
  extensions?: SupportedFileExtension[];
}
