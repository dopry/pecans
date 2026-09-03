import { clean } from "semver";

/**
 * The semver version a release tag names, or undefined when the tag is not
 * a version at all. Loose parsing accepts a leading "v" and drops build
 * metadata ("v1.2.3+build.7" -> "1.2.3"); "nightly" or "docs-1" yield
 * undefined so backends can skip them instead of ingesting an unparseable
 * release (#80).
 */
export function versionFromTag(tag: string): string | undefined {
  return clean(tag, { loose: true }) ?? undefined;
}
