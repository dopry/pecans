// keep the module graph cycle-free: import specific util modules rather
// than the ../utils barrel
import type { Architecture } from "../utils/Architecture.js";
import type { OperatingSystem } from "../utils/OperatingSystem.js";
import type { PackageFormat } from "../utils/PackageFormat.js";
import type { SupportedFileExtension } from "../utils/SupportedFileExtension.js";

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
