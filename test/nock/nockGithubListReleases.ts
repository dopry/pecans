import { customAlphabet } from "nanoid";
import { GithubRelease, GithubReleaseAsset } from "../../src";
import { Nock } from "./Nock";
const numericId = customAlphabet("1234567890", 8);

export function get_mock_content_type(filename: string) {
  if (filename.endsWith("dmg")) return "application/x-apple-diskimage";
  if (filename.endsWith("zip")) return "application/zip";
  if (filename.endsWith("exe")) return "application/x-msdos-program";
  return "application/octet-stream";
}

export function mock_github_asset(
  owner: string,
  repo: string,
  filename: string
): Partial<GithubReleaseAsset> {
  const id = parseInt(numericId(8));
  const content_type = get_mock_content_type(filename);
  return {
    url: `https://api.github.com/repos/${owner}/${repo}/releases/assets/${id}`,
    id,
    node_id: "RA_kwDOEXgi284Dh9wg",
    name: filename,
    label: "",
    content_type,
    state: "uploaded",
    size: 143940252,
    download_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    browser_download_url: `https://github.com/${owner}/${repo}/releases/download/untagged-c1fb65790b65dd7670fc/${filename}`,
  };
}

export function mock_github_release(
  owner: string,
  repo: string,
  tag_name: string,
  assets: Partial<GithubReleaseAsset>[],
  draft = false,
  prerelease = false
): Partial<GithubRelease> {
  const id = parseInt(numericId(8));
  const created_at = new Date().toISOString();
  const published_at = draft ? null : new Date().toISOString();
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/${id}`;

  return {
    url,
    assets_url: `${url}/assets`,
    id,
    tag_name,
    target_commitish: "next",
    name: tag_name,
    draft,
    prerelease,
    created_at,
    published_at,
    assets: assets as GithubReleaseAsset[],
    tarball_url: null,
    zipball_url: null,
    body: null,
  };
}

export function mockTypicalAssets(
  owner: string,
  repo: string,
  version: string
): Partial<GithubReleaseAsset>[] {
  return [
    mock_github_asset(owner, repo, `app-${version}-x64-setup.exe`),
    mock_github_asset(owner, repo, `app-${version}-x64-full.nupkg`),
    mock_github_asset(owner, repo, `app-${version}-x64.dmg`),
    mock_github_asset(owner, repo, `app-${version}-arm64.dmg`),
    mock_github_asset(owner, repo, `app-${version}-univ.dmg`),
  ];
}

export function mockTypicalReleases(
  owner: string,
  repo: string,
  versions: string[] = ["2.7.0", "2.6.0", "2.5.0"]
): Partial<GithubRelease>[] {
  return versions.map((version) => {
    const assets = mockTypicalAssets(owner, repo, version);
    const tag_name = `v${version}`;
    return mock_github_release(owner, repo, tag_name, assets);
  });
}

export function nockGithubListReleases(
  nock: Nock,
  owner: string,
  repo: string,
  releases: Partial<GithubRelease>[] = mockTypicalReleases(owner, repo)
) {
  nock("https://api.github.com:443", { encodedQueryParams: true })
    .get(`/repos/${owner}/${repo}/releases`)
    .reply(200, releases, ["Content-Type", "application/json; charset=utf-8"]);
}
