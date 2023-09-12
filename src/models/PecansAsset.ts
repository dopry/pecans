import { extname } from "path";
import {
  Architecture,
  filenameToArchitectureLegacy,
  filenameToOperatingSystem,
  filenameToPackageFormat,
  filenameToSupportedArchitecture,
  OperatingSystem,
  PackageFormat,
  Platform,
  SupportedArchitecture,
} from "../utils";
import { SupportedFileExtension } from "../utils/SupportedFileExtension";
import { PecansAssetQuery } from "./PecansAssetQuery";

export interface PecansAssetDTO {
  content_type: string;
  filename: string;
  id: string;
  raw: any;
  size: number;
  // @deprecated use os, arch, and pkg in place of platform.
  type: Platform;
}

export class PecansAsset implements PecansAssetDTO {
  os: OperatingSystem;
  // @deprecated, should be using archs instead. remove once old arch/type is removed from pecans.
  arch: Architecture;
  archs: SupportedArchitecture[];
  pkg?: PackageFormat;
  id: string;
  filename: string;
  // @deprecated, use os, archs, and pkg instead for filtering.
  type: Platform;
  size: number;
  content_type: string;
  raw: any;

  constructor(dto: PecansAssetDTO) {
    this.content_type = dto.content_type;
    this.filename = dto.filename;
    this.id = dto.id;
    this.raw = dto.raw;
    this.size = dto.size;
    this.type = dto.type;
    this.os = filenameToOperatingSystem(this.filename);
    this.arch = filenameToArchitectureLegacy(this.filename);
    this.archs = filenameToSupportedArchitecture(this.filename);
    this.pkg = filenameToPackageFormat(this.filename);
  }

  satisfiesQuery(query: PecansAssetQuery) {
    return (
      this.satisfiesOS(query.os) &&
      this.satisfiesArch(query.arch) &&
      this.satisfiesArchs(query.archs) &&
      this.satisfiesPkg(query.pkg) &&
      this.satisfiesFilename(query.filename) &&
      this.satisfiesExtensions(query.extensions)
    );
  }

  satisfiesOS(os?: OperatingSystem) {
    return os == undefined || this.os == os;
  }

  // @deprecated, use satisfiesSupportedArch instead.
  satisfiesArch(arch?: Architecture) {
    return arch == undefined || this.arch == arch;
  }

  satisfiesArchs(archs?: SupportedArchitecture[]) {
    // check that all archs are supported, primarily used to filter universal binaries.
    return (
      archs == undefined || archs.every((arch) => this.archs.includes(arch))
    );
  }

  satisfiesPkg(pkg?: PackageFormat) {
    return pkg == undefined || this.pkg == pkg;
  }

  satisfiesFilename(filename?: string) {
    return filename == undefined || this.filename == filename;
  }

  satisfiesExtensions(extensions?: SupportedFileExtension[]) {
    if (!extensions) return true;
    const ext = extname(this.filename);
    return extensions.includes(ext as SupportedFileExtension);
  }
}

export function isPecansAsset(obj: unknown): obj is PecansAsset {
  return obj instanceof PecansAsset;
}
