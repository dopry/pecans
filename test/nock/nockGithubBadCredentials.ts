import { Nock } from "./Nock";

export default function (nock: Nock) {
  nock("https://api.github.com:443", { encodedQueryParams: true })
    .get("/repos/owner/repo/releases")
    .reply(401, {
      message: "Bad credentials",
      documentation_url: "https://docs.github.com/rest",
    });
}
