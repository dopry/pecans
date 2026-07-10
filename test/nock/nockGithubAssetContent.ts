import { PecansAsset } from "../../src/models";
import { Nock } from "./Nock";

/**
 * Mock the GitHub asset endpoint to return the asset's content directly
 * (200 + body) rather than a 302 redirect. Backend.readAsset() /
 * getAssetStream() fetch `asset.raw.url` with `Accept: application/octet-stream`
 * and consume the response body, so a direct 200 models the post-redirect
 * response without needing a second interceptor.
 */
export function nockGithubAssetContent(
  nock: Nock,
  owner: string,
  repo: string,
  asset: PecansAsset,
  content: string | Buffer
) {
  nock("https://api.github.com:443", { encodedQueryParams: true })
    .get(`/repos/${owner}/${repo}/releases/assets/${asset.id}`)
    .reply(200, content, [
      "Content-Type",
      "application/octet-stream",
      "Content-Length",
      String(Buffer.byteLength(content)),
    ]);
}
