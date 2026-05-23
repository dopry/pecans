import { extname } from "path";
import { OperatingSystem } from "./OperatingSystem";
import { PackageFormat } from "./PackageFormat";

export const SUPPORTED_FILE_EXTENSIONS = [
  ".exe",
  ".dmg",
  ".deb",
  ".rpm",
  ".tgz",
  ".tar.gz",
  ".zip",
  ".nupkg",
  ".msix",
  ".msixbundle",
] as const;
export type SupportedFileExtension = typeof SUPPORTED_FILE_EXTENSIONS[number];
export function isSupportedFileExtension(
  obj: unknown
): obj is SupportedFileExtension {
  return (
    typeof obj == "string" &&
    SUPPORTED_FILE_EXTENSIONS.includes(obj as SupportedFileExtension)
  );
}

// we need special handling for .tar.gz
export function getSupportedExt(
  filename: string
): SupportedFileExtension | undefined {
  const ext = filename.endsWith(".tar.gz")
    ? ".tar.gz"
    : (extname(filename) as SupportedFileExtension);
  return isSupportedFileExtension(ext) ? ext : undefined;
}

export function getDownloadExtensionsByOs(
  os: OperatingSystem,
  pkg?: PackageFormat
): SupportedFileExtension[] {
  switch (os) {
    case "osx":
      return [".dmg"];
    case "windows":
      switch (pkg) {
        case "msix":
          // .msixbundle preferred over .msix when both are present, since a
          // bundle covers multiple architectures; the resolver falls back to
          // a single-arch .msix when no bundle exists.
          return [".msixbundle", ".msix"];
        default:
          return [".exe"];
      }
    case "linux":
      switch (pkg) {
        case "deb":
          return [".deb", ".tgz", ".tar.gz"];
        case "rpm":
          return [".rpm", ".tgz", ".tar.gz"];
        default:
          return [".tgz", ".tar.gz"];
      }
  }
}
