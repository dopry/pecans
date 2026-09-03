import { prerelease } from "semver";

/** The channel a version without a prerelease identifier lands on. */
export const STABLE_CHANNEL = "stable";

// Extract channel of version
export function channelFromVersion(version: string): string {
  const components = prerelease(version);
  if (!components) return STABLE_CHANNEL;
  const [channel] = components;
  return typeof channel == "string" ? channel : STABLE_CHANNEL;
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
