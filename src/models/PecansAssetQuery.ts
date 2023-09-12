import {
  Architecture,
  OperatingSystem,
  PackageFormat,
  SupportedArchitecture,
  SupportedFileExtension,
} from "../utils";

export interface PecansAssetQuery {
  os?: OperatingSystem;
  // @deprecated, use supportedArch instead.
  arch?: Architecture;
  // TODO: rename to arch after removing the current arch.
  archs?: SupportedArchitecture[];
  pkg?: PackageFormat;
  filename?: string;
  extensions?: SupportedFileExtension[];
}
