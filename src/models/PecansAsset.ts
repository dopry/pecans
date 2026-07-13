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
import { PackageFormatQuery, PecansAssetQuery } from "./PecansAssetQuery";

export interface PecansAssetDTO<TRaw = unknown> {
  content_type: string;
  filename: string;
  id: string;
  /**
   * Backend-private payload attached by the backend that created the asset
   * (e.g. the GitHub API asset object, which the GitHub backend reads back
   * in serveAsset/getAssetStream). Opaque outside that backend: core and
   * other consumers must not interpret it. Backends declare their payload
   * type via TRaw (e.g. `Backend<GithubReleaseAsset>`) for typed reads.
   */
  raw: TRaw;
  size: number;
  // TODO:  use os, arch, and pkg in place of platform.
  type: Platform;
}

export class PecansAsset<TRaw = unknown> implements PecansAssetDTO<TRaw> {
  os: OperatingSystem;
  arch: Architecture;
  pkg?: PackageFormat;
  id: string;
  filename: string;
  type: Platform;
  size: number;
  content_type: string;
  raw: TRaw;

  constructor(dto: PecansAssetDTO<TRaw>) {
    this.content_type = dto.content_type;
    this.filename = dto.filename;
    this.id = dto.id;
    this.raw = dto.raw;
    this.size = dto.size;
    this.type = dto.type;
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

  satisfiesPkg(pkg?: PackageFormatQuery) {
    // an asset without an alternate package format IS the platform's
    // default package; "default" selects exactly those (e.g. the composite
    // "linux_64" platform serves the tarball, never deb/rpm)
    if (pkg === "default") return this.pkg == undefined;
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
