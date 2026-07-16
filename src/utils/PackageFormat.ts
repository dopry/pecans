import { ParsedQs } from "qs";
// TODO: more consistent use of explicit package name instead of assuming based on context
export const PACKAGE_FORMATS = [
  "deb",
  "rpm",
  "msix" /*"zip", "dmg", "tar", "nupkg"*/,
] as const;
export type PackageFormat = (typeof PACKAGE_FORMATS)[number];
// check if a string is an Package type identifier
export function isPackageFormat(obj: unknown): obj is PackageFormat {
  return (
    typeof obj == "string" && PACKAGE_FORMATS.includes(obj as PackageFormat)
  );
}

export function filenameToPackageFormat(
  filename: string,
): PackageFormat | undefined {
  const name = filename.toLowerCase();
  if (name.endsWith(".deb")) return "deb";
  if (name.endsWith(".rpm")) return "rpm";
  if (name.endsWith(".msix") || name.endsWith(".msixbundle")) return "msix";
}

/**
 * msix downloads are requested via ?filetype=msix|msixbundle rather than a
 * composite platform id (there is no windows_msix platform in the wild), so
 * those filetypes imply the msix package format on the resolution filters.
 * Other filetypes never imply a pkg: legacy requests like ?filetype=deb keep
 * their platform-default resolution semantics.
 */
export function filetypeToPackageFormat(
  filetype?: string,
): PackageFormat | undefined {
  if (!filetype) return undefined;
  const ext = filetype.toLowerCase().replace(/^\./, "");
  if (ext === "msix" || ext === "msixbundle") return "msix";
  return undefined;
}

export function getPkgFromQuery(query: ParsedQs): PackageFormat | undefined {
  return query.pkg &&
    typeof query.pkg === "string" &&
    isPackageFormat(query.pkg)
    ? query.pkg
    : undefined;
}
