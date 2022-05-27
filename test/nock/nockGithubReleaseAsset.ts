import { PecansAsset } from "../../src/models";
import { Nock } from "./Nock";

export function nockGithubReleasesAssetRedirect(
  nock: Nock,
  owner: string,
  repo: string,
  asset: PecansAsset
) {
  nock("https://api.github.com:443", { encodedQueryParams: true })
    .get(`/repos/${owner}/${repo}/releases/assets/${asset.id}`)
    .reply(302, undefined, [
      "Content-Type",
      "text/html;charset=utf-8",
      "Content-Length",
      "0",
      "Location",
      `https://objects.githubusercontent.com/github-production-release-asset-2e65be/293085915/cd1eb5a9-d90e-4304-b4c6-6ae51a40d22c?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIWNJYAX4CSVEH53A%2F20230913%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20230913T174715Z&X-Amz-Expires=300&X-Amz-Signature=07540c2d0360aa178d0cb19dc0b6f65c5356272791183189db2813e87da3e944&X-Amz-SignedHeaders=host&actor_id=84532790&key_id=0&repo_id=293085915&response-content-disposition=attachment%3B%20filename%3D${asset.filename}&response-content-type=application%2Foctet-stream`,
      "connection",
      "close",
    ]);
}
