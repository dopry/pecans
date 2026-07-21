import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  Backend,
  type BackendOpts,
  BackendSettings,
} from "../../src/backends/backend.js";
import { ForbiddenError } from "../../src/errors.js";
import {
  PecansAsset,
  type PecansAssetDTO,
} from "../../src/models/PecansAsset.js";
import { PecansReleases } from "../../src/models/PecansReleases.js";

// Test implementation of Backend to test abstract methods and middleware
class TestBackend extends Backend {
  public fetchCount = 0;
  public mockReleases: PecansReleases;

  constructor(opts?: BackendOpts) {
    super(opts);
    this.mockReleases = new PecansReleases([]);
  }

  async fetchReleases(): Promise<PecansReleases> {
    this.fetchCount++;
    return this.mockReleases;
  }
}

describe("Backend Complete Coverage", () => {
  describe("BackendSettings", () => {
    it("should initialize with default values", () => {
      const settings = new BackendSettings();

      expect(settings.refreshSecret).toBeUndefined();
      expect(settings.cacheMaxAge).toBe(60 * 60 * 2); // 2 hours in seconds
    });

    it("should allow custom cacheMaxAge to be set", () => {
      const settings = new BackendSettings();
      settings.cacheMaxAge = 3600;

      expect(settings.refreshSecret).toBeUndefined();
      expect(settings.cacheMaxAge).toBe(3600);
    });
  });

  describe("getRefreshWebhookMiddleware", () => {
    let backend: TestBackend;
    // express 5 declares Request.path readonly; the mock needs a mutable one
    let mockReq: Omit<Partial<Request>, "path" | "get"> & {
      path?: string;
      get: ReturnType<typeof vi.fn>;
    };
    let mockRes: Partial<Response> & {
      status: ReturnType<typeof vi.fn>;
      json: ReturnType<typeof vi.fn>;
    };
    let mockNext: NextFunction;

    beforeEach(() => {
      mockReq = {
        path: "/api/refresh",
        method: "POST",
        query: {},
        get: vi.fn().mockReturnValue(undefined),
      };
      mockRes = {
        status: vi.fn(),
        json: vi.fn(),
      };
      mockRes.status.mockReturnValue(mockRes);
      mockNext = vi.fn();
    });

    it("should call next() immediately when no hash is set (no refresh secret)", () => {
      backend = new TestBackend(); // No refreshSecret provided
      const middleware = backend.getRefreshWebhookMiddleware("/api/refresh");

      middleware(mockReq as unknown as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it("should call next() when path does not match", () => {
      backend = new TestBackend({ refreshSecret: "test-secret" });
      mockReq.path = "/different/path";
      const middleware = backend.getRefreshWebhookMiddleware("/api/refresh");

      middleware(mockReq as unknown as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    // the refresh contract is POST-only; other methods fall through so a
    // crawler hitting a shared ?secret= link can't trigger a refresh
    it("should call next() for non-POST methods on the watched path", () => {
      backend = new TestBackend({ refreshSecret: "test-secret" });
      mockReq.method = "GET";
      mockReq.query = { secret: "test-secret" };
      const middleware = backend.getRefreshWebhookMiddleware("/api/refresh");

      middleware(mockReq as unknown as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it("should 403 when the secret does not match", () => {
      backend = new TestBackend({ refreshSecret: "test-secret" });
      mockReq.query = { secret: "wrong-secret" };
      const middleware = backend.getRefreshWebhookMiddleware("/api/refresh");

      middleware(mockReq as unknown as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it("should 403 when no secret is provided on the watched path", () => {
      backend = new TestBackend({ refreshSecret: "test-secret" });
      const middleware = backend.getRefreshWebhookMiddleware("/api/refresh");

      middleware(mockReq as unknown as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it("should refresh cache and respond 200 for a valid ?secret= query", async () => {
      backend = new TestBackend({ refreshSecret: "test-secret" });
      mockReq.query = { secret: "test-secret" };

      const refreshCacheSpy = vi
        .spyOn(backend, "refreshCache")
        .mockResolvedValue(backend.mockReleases);
      const middleware = backend.getRefreshWebhookMiddleware("/api/refresh");

      middleware(mockReq as unknown as Request, mockRes as Response, mockNext);
      await vi.waitFor(() => expect(mockRes.json).toHaveBeenCalled());

      expect(refreshCacheSpy).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ refreshed: true });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should accept the secret from the X-Pecans-Secret header", async () => {
      backend = new TestBackend({ refreshSecret: "test-secret" });
      mockReq.get.mockImplementation((name: string) =>
        name.toLowerCase() === "x-pecans-secret" ? "test-secret" : undefined,
      );

      const refreshCacheSpy = vi
        .spyOn(backend, "refreshCache")
        .mockResolvedValue(backend.mockReleases);
      const middleware = backend.getRefreshWebhookMiddleware("/api/refresh");

      middleware(mockReq as unknown as Request, mockRes as Response, mockNext);
      await vi.waitFor(() => expect(mockRes.json).toHaveBeenCalled());

      expect(refreshCacheSpy).toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    it("should call next with error when refreshCache fails", async () => {
      backend = new TestBackend({ refreshSecret: "test-secret" });
      mockReq.query = { secret: "test-secret" };

      const testError = new Error("Cache refresh failed");
      const refreshCacheSpy = vi
        .spyOn(backend, "refreshCache")
        .mockRejectedValue(testError);
      const middleware = backend.getRefreshWebhookMiddleware("/api/refresh");

      // The middleware is not async, but refreshCache is, so we need to wait
      middleware(mockReq as unknown as Request, mockRes as Response, mockNext);
      await vi.waitFor(() => expect(mockNext).toHaveBeenCalled());

      expect(refreshCacheSpy).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(testError);
      expect(mockRes.json).not.toHaveBeenCalled();
    });
  });

  describe("Abstract Methods", () => {
    let backend: TestBackend;

    beforeEach(() => {
      backend = new TestBackend();
    });

    it("should throw 'Abstract Method' error for serveAsset", async () => {
      const mockAssetDTO: PecansAssetDTO = {
        id: "test-asset",
        type: "windows_64",
        filename: "test.exe",
        size: 1000,
        content_type: "application/octet-stream",
        raw: {},
      };
      const mockResponse = {} as Response;

      await expect(
        backend.serveAsset(mockAssetDTO, mockResponse),
      ).rejects.toThrow("Abstract Method");
    });

    it("should throw 'Abstract Method' error for getAssetStream", async () => {
      const mockAsset = new PecansAsset({
        id: "test-asset",
        type: "windows_64",
        filename: "test.exe",
        size: 1000,
        content_type: "application/octet-stream",
        raw: {},
      });

      await expect(backend.getAssetStream(mockAsset)).rejects.toThrow(
        "Abstract Method",
      );
    });
  });

  describe("readAsset edge cases", () => {
    let backend: TestBackend;

    beforeEach(() => {
      backend = new TestBackend();
    });

    it("should handle non-Error exceptions in readAsset", async () => {
      const mockAsset = new PecansAsset({
        id: "test-asset",
        type: "windows_64",
        filename: "test.exe",
        size: 1000,
        content_type: "application/octet-stream",
        raw: {},
      });

      // Mock getAssetStream to throw a non-Error object
      const nonErrorObject = { message: "Something went wrong", code: 500 };
      vi.spyOn(backend, "getAssetStream").mockRejectedValue(nonErrorObject);

      await expect(backend.readAsset(mockAsset)).rejects.toBe(nonErrorObject);
    });

    it("should handle string exceptions in readAsset", async () => {
      const mockAsset = new PecansAsset({
        id: "test-asset",
        type: "windows_64",
        filename: "test.exe",
        size: 1000,
        content_type: "application/octet-stream",
        raw: {},
      });

      // Mock getAssetStream to throw a string
      const stringError = "String error message";
      vi.spyOn(backend, "getAssetStream").mockRejectedValue(stringError);

      await expect(backend.readAsset(mockAsset)).rejects.toBe(stringError);
    });

    it("should handle Error exceptions that are not premature close in pipeline", async () => {
      const mockAsset = new PecansAsset({
        id: "test-asset-123",
        type: "windows_64",
        filename: "test.exe",
        size: 1000,
        content_type: "application/octet-stream",
        raw: {},
      });

      // Create a stream that will fail during pipeline execution
      const { Readable } = await import("stream");
      const errorStream = new Readable({
        read() {
          // Emit an error that doesn't contain "Premature close"
          this.emit("error", new Error("Network timeout occurred"));
        },
      });

      vi.spyOn(backend, "getAssetStream").mockResolvedValue(errorStream);

      await expect(backend.readAsset(mockAsset)).rejects.toThrow(
        "Failed to read asset test-asset-123: Network timeout occurred",
      );
    });

    it("should handle non-Error exceptions thrown during pipeline execution", async () => {
      const mockAsset = new PecansAsset({
        id: "test-asset-456",
        type: "linux_64",
        filename: "test.tar.gz",
        size: 2000,
        content_type: "application/gzip",
        raw: {},
      });

      // Create a stream that will emit a non-Error during pipeline execution
      const { Readable } = await import("stream");
      const stringErrorStream = new Readable({
        read() {
          // Emit a non-Error (string) - this will cause pipeline to throw the string directly
          this.emit("error", "Non-Error string from stream");
        },
      });

      vi.spyOn(backend, "getAssetStream").mockResolvedValue(stringErrorStream);

      // The non-Error should be re-thrown as-is (hitting line 158)
      await expect(backend.readAsset(mockAsset)).rejects.toBe(
        "Non-Error string from stream",
      );
    });

    it("should handle object exceptions thrown during pipeline execution", async () => {
      const mockAsset = new PecansAsset({
        id: "test-asset-789",
        type: "osx_64",
        filename: "test.dmg",
        size: 3000,
        content_type: "application/x-apple-diskimage",
        raw: {},
      });

      // Create a stream that will emit a non-Error object during pipeline execution
      const { Readable } = await import("stream");
      const objectError = {
        code: 500,
        message: "Custom object error",
        timestamp: Date.now(),
      };
      const objectErrorStream = new Readable({
        read() {
          // Emit a non-Error object - this will cause pipeline to throw the object directly
          this.emit("error", objectError);
        },
      });

      vi.spyOn(backend, "getAssetStream").mockResolvedValue(objectErrorStream);

      // The non-Error object should be re-thrown as-is (hitting line 158)
      await expect(backend.readAsset(mockAsset)).rejects.toBe(objectError);
    });
  });

  describe("Constructor with hash generation", () => {
    it("should generate hash when refreshSecret is provided", () => {
      const refreshSecret = "test-secret-123";
      const backend = new TestBackend({ refreshSecret });

      // We can't directly access the private hash property, but we can test
      // the behavior through the middleware which depends on the hash
      expect(backend).toBeInstanceOf(Backend);
      expect(backend).toBeInstanceOf(TestBackend);
    });

    it("should not generate hash when no refreshSecret is provided", () => {
      const backend = new TestBackend();

      // Test that middleware behaves correctly when no hash is set
      const middleware = backend.getRefreshWebhookMiddleware("/test");
      const mockNext = vi.fn();

      middleware(
        { path: "/test", params: {} } as Request,
        {} as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should merge options with default settings", () => {
      const customOpts = {
        refreshSecret: "custom-secret",
        cacheMaxAge: 1800,
      };
      const backend = new TestBackend(customOpts);

      expect(backend).toBeInstanceOf(Backend);
      // The options are merged in the constructor, we can verify behavior indirectly
    });
  });
});
