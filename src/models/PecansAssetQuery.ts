// import from the specific util modules, not the ../utils barrel - the
// barrel re-exports resolveForVersion, whose deprecation adapter imports
// the service module that consumes these query types (import cycle)
import { Architecture } from "../utils/Architecture";
import { OperatingSystem } from "../utils/OperatingSystem";
import { PackageFormat } from "../utils/PackageFormat";
import { SupportedFileExtension } from "../utils/SupportedFileExtension";

export interface PecansAssetQuery {
  os?: OperatingSystem;
  arch?: Architecture;
  /**
   * Alternate package format to require (deb/rpm); omitted = unconstrained.
   * An asset without an alternate format is the platform's default package
   * (tarball, dmg, setup.exe) - selecting only those is a download-semantics
   * concern, expressed as pkg: "default" on the ReleaseService filters
   * (PackageFormatFilter).
   */
  pkg?: PackageFormat;
  filename?: string;
  extensions?: SupportedFileExtension[];
}
