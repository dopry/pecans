import express, { NextFunction, Request, Response } from "express";
import { errorHandler } from "./errors";
import { PecansGitHubBackend } from "./backends";
import { Pecans, PecansOptions } from "./pecans";

export * from "./backends";
export * from "./errors";
export * from "./models";
export * from "./pecans";
export * from "./utils/";
export * from "./versions";

export function configure() {
  const PECANS_BACKEND = process.env.PECANS_BACKEND || "PecansGithubBackend";
  const basePath = process.env.PECANS_BASE_PATH || "";
  const cacheMaxAge = process.env.PECANS_CACHE_MAX_AGE
    ? parseInt(process.env.PECANS_CACHE_MAX_AGE)
    : 60 * 60 * 2; // Default 2 hours

  const pecansOpts: PecansOptions = {
    // base path to inject between host and relative path. use for D.O. app service where
    // app is proxied through / api and the original url isn't passed by the proxy.
    basePath,
    cacheMaxAge,
  };

  switch (PECANS_BACKEND) {
    case "PecansGithubBackend": {
      const backendEnv = PecansGitHubBackend.getEnvironment();
      // Pass cacheMaxAge to the backend
      const backend = PecansGitHubBackend.FromEnv(backendEnv, { cacheMaxAge });
      const pecans = new Pecans(backend, pecansOpts);
      return { env: backendEnv, backend, pecans };
    }
    default:
      throw new Error(
        "Unrecognized PECANS_BACKEND. Must be one of ['PecansGithubBackend']",
      );
  }
}

export function main() {
  const { pecans } = configure();
  const port = process.env.PORT || 5000;

  const app = express();
  app.use(pecans.router);
  app.use((req: Request, res: Response, next: NextFunction): void => {
    res.status(404).send("Page not found");
  });
  // pecans.router carries its own errorHandler; this catches errors from
  // anything mounted outside it
  app.use(errorHandler());
  const server = app.listen(port, () => {
    const address = server.address() || "0.0.0.0";

    if (typeof address == "string") {
      console.log(`Listening at ${address}`);
    } else {
      console.log(
        `Listening at http://${address.address || "0.0.0.0"}:${port}`,
      );
    }
  });
}

// run the server when executed directly (node dist/index.js); the typeof
// guard keeps the ESM build importable, where `require` does not exist
if (typeof require !== "undefined" && require.main === module) {
  main();
}
