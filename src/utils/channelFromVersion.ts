import { prerelease } from "semver";

/** The channel a version without a prerelease identifier lands on. */
export const STABLE_CHANNEL = "stable";

/**
 * The channel a version belongs to: stable for a plain release, otherwise
 * the first prerelease identifier ("2.0.0-beta.3" -> "beta"). A numeric
 * identifier ("2.9.0-1" -> "1") is a valid semver prerelease and is the
 * channel too: node-semver hands it back as a number, which used to fall
 * through to stable and put a prerelease in front of stable users (#81).
 */
export function channelFromVersion(version: string): string {
  const components = prerelease(version);
  if (!components) return STABLE_CHANNEL;
  const [channel] = components;
  return String(channel);
}

/**
 * True when a channel query names a prerelease channel, so every release it
 * can match is a prerelease. Semver ranges evaluated for such a query must
 * include prereleases across every major.minor.patch tuple: semver's
 * default only matches a prerelease inside the tuple of a prerelease
 * comparator, so ">=2.8.0-beta.2" would never match "2.9.0-beta.1" and a
 * beta client would never see the next minor's beta (#79). The channel
 * filter is what keeps stable users off prereleases, so the range must not
 * double-filter them. An absent channel, "*" (any channel) and stable keep
 * the default semver semantics.
 */
export function channelQueryIncludesPrereleases(channel?: string): boolean {
  return channel !== undefined && channel !== "*" && channel !== STABLE_CHANNEL;
}
