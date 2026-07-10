import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import {
  BadRequestError,
  errorHandler,
  HttpError,
  NotFoundError,
  UnsupportedChannelError,
  UnsupportedPlatformError,
  UnsupportedTagError,
} from "../../src/errors";

describe("error hierarchy", () => {
  it("carries status codes", () => {
    expect(new BadRequestError("x").statusCode).toBe(400);
    expect(new NotFoundError("x").statusCode).toBe(404);
    expect(new UnsupportedPlatformError("amiga").statusCode).toBe(400);
    expect(new UnsupportedChannelError(1).statusCode).toBe(400);
    expect(new UnsupportedTagError("nope").statusCode).toBe(400);
  });

  it("all extend HttpError and Error", () => {
    const err = new NotFoundError("gone");
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("NotFoundError");
  });
});

describe("errorHandler middleware", () => {
  const makeRes = () => {
    const res = {
      headersSent: false,
      status: vi.fn(),
      format: vi.fn(),
      send: vi.fn(),
    };
    res.status.mockReturnValue(res);
    // run the default formatter so send() is observable
    res.format.mockImplementation((handlers: Record<string, () => void>) => {
      handlers.default();
      return res;
    });
    return res as unknown as Response & {
      status: ReturnType<typeof vi.fn>;
      send: ReturnType<typeof vi.fn>;
    };
  };

  it("maps HttpError to its status code", () => {
    const res = makeRes();
    const next = vi.fn();
    errorHandler()(new NotFoundError("missing"), {} as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith("missing");
    expect(next).not.toHaveBeenCalled();
  });

  it("falls back to 500 for unknown errors and logs them", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = makeRes();
    errorHandler()(new Error("boom"), {} as Request, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("delegates when headers are already sent", () => {
    const res = makeRes();
    (res as unknown as { headersSent: boolean }).headersSent = true;
    const next = vi.fn() as NextFunction;
    const err = new NotFoundError("late");
    errorHandler()(err, {} as Request, res, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});
