import { NextFunction, Request, Response } from "express";
import { PLATFORMS } from "./utils/platforms";

/**
 * Error hierarchy for pecans' HTTP surface. Errors carry the status code
 * they map to; the errorHandler middleware translates them into responses.
 * Anything that is not an HttpError is treated as an internal error (500).
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class UnsupportedPlatformError extends BadRequestError {
  constructor(platform: unknown) {
    const platforms = PLATFORMS.join(", ");
    super(`Unsupported platform (${platform}), expected one of [${platforms}]`);
  }
}

export class UnsupportedChannelError extends BadRequestError {
  constructor(channel: unknown) {
    super(
      `Unsupported channel (${channel}), expected a single string of 'stable', '*' or a user-defined channel`,
    );
  }
}

export class UnsupportedTagError extends BadRequestError {
  constructor(tag: unknown) {
    super(`Unsupported tag (${tag}), expected 'latest' or a semver range`);
  }
}

/**
 * Express error middleware translating HttpErrors into their status codes,
 * with a logged 500 fallback for everything else. Registered on the pecans
 * router so composed apps get typed errors without extra wiring; also
 * exported for host apps that want the same shape on their own routes.
 */
export function errorHandler() {
  return (err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      return next(err);
    }
    const statusCode = err instanceof HttpError ? err.statusCode : 500;
    const message = err instanceof Error ? err.message : String(err);
    if (statusCode >= 500) {
      console.error(err instanceof Error ? (err.stack ?? err) : err);
    }
    res.status(statusCode).format({
      "application/json": () => {
        res.send({ error: message, code: statusCode });
      },
      default: () => {
        res.send(message);
      },
    });
  };
}
