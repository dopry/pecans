import { Architecture, OperatingSystem, PackageFormat } from "../utils";
import { SupportedFileExtension } from "../utils/SupportedFileExtension";

export interface PecansAssetQuery {
  os?: OperatingSystem;
  arch?: Architecture;
  /** undefined = any package format; null = only assets without one */
  pkg?: PackageFormat | null;
  filename?: string;
  extensions?: SupportedFileExtension[];
}
