import {
  Architecture,
  filenameToArchitecture,
  filenameToOperatingSystem,
  filenameToPackageFormat,
  OperatingSystem,
  PackageFormat,
  Platform,
} from "../utils";
import {
  getSupportedExt,
  SupportedFileExtension,
} from "../utils/SupportedFileExtension";
import { PecansAssetQuery } from "./PecansAssetQuery";

export interface PecansAssetDTO {
  content_type: string;
  filename: string;
  id: string;
  /**
   * Public URL clients can be redirected to for this asset. Populated by the
   * backend that normalizes the asset.
   */
  downloadUrl?: string;
  /**
   * Backend API URL for authenticated fetches of the asset content (e.g. the
   * GitHub releases-asset API endpoint). Populated by the backend that
   * normalizes the asset.
   */
  apiUrl?: string;
  /**
   * Backend-specific payload the asset was normalized from. Opaque outside
   * the backend that created the asset; prefer the explicit fields above.
   */
  raw: any;
  size: number;
  // TODO:  use os, arch, and pkg in place of platform.
  type: Platform;
}

export class PecansAsset implements PecansAssetDTO {
  os: OperatingSystem;
  arch: Architecture;
  pkg?: PackageFormat;
  id: string;
  filename: string;
  type: Platform;
  size: number;
  content_type: string;
  downloadUrl?: string;
  apiUrl?: string;
  raw: any;

  constructor(dto: PecansAssetDTO) {
    this.content_type = dto.content_type;
    this.filename = dto.filename;
    this.id = dto.id;
    this.raw = dto.raw;
    this.size = dto.size;
    this.type = dto.type;
    // raw is backend-specific, so the neutral model never interprets it;
    // legacy raw-only assets are handled by the backend that created them
    this.downloadUrl = dto.downloadUrl;
    this.apiUrl = dto.apiUrl;
    this.os = filenameToOperatingSystem(this.filename);
    this.arch = filenameToArchitecture(this.filename, this.os);
    this.pkg = filenameToPackageFormat(this.filename);
  }

  satisfiesQuery(query: PecansAssetQuery) {
    return (
      this.satisfiesOS(query.os) &&
      this.satisfiesArch(query.arch) &&
      this.satisfiesPkg(query.pkg) &&
      this.satisfiesFilename(query.filename) &&
      this.satisfiesExtensions(query.extensions)
    );
  }

  satisfiesOS(os?: OperatingSystem) {
    return os == undefined || this.os == os;
  }

  satisfiesArch(arch?: Architecture) {
    return arch == undefined || this.arch == arch;
  }

  satisfiesPkg(pkg?: PackageFormat) {
    return pkg == undefined || this.pkg == pkg;
  }

  satisfiesFilename(filename?: string) {
    return filename == undefined || this.filename == filename;
  }

  satisfiesExtensions(extensions?: SupportedFileExtension[]) {
    if (!extensions) return true;
    // getSupportedExt handles the ".tar.gz" double extension, which
    // path.extname would report as ".gz"
    const ext = getSupportedExt(this.filename);
    return ext != undefined && extensions.includes(ext);
  }
}
