import { NextFunction, Request, Response } from "express";
import { ParsedQs } from "qs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getFilenameFromQuery,
  getFiletypeFromQuery,
  getPlatformFromQuery,
  getStringValueFromRequestQuery,
  getVersionFromQuery,
  Pecans,
  PecansOptions,
  UnsupportedChannelError,
  UnsupportedPlatformError,
  UnsupportedTagError,
  validateReqQueryChannel,
  validateReqQueryPlatform,
  validateReqQueryTag,
} from "../../src/pecans";

// Import types and dependencies
import { Backend } from "../../src/backends/backend";
import { PecansRelease, PecansReleases } from "../../src/models";

// Mock all external dependencies
vi.mock("debug", () => ({
  default: () => () => {},
}));

// Mock Backend class
class MockBackend extends Backend {
  public mockReleases: PecansReleases | null = null;
  public mockAssetContent = Buffer.from("test content");
  public refreshCacheCalled = false;

  async fetchReleases(): Promise<PecansReleases> {
    return this.releases();
  }

  async serveAsset(asset: any, res: Response) {
    res.set("Content-Length", this.mockAssetContent.length.toString());
    res.send(this.mockAssetContent);
  }

  async getAssetStream() {
    return null;
  }

  async refreshCache(): Promise<PecansReleases> {
    this.refreshCacheCalled = true;
    return this.releases();
  }

  async releases(): Promise<PecansReleases> {
    if (!this.mockReleases) {
      // Create mock releases with proper structure
      const mockRelease = new PecansRelease({
        version: "1.0.0",
        channel: "stable",
        notes: "Test release notes",
        published_at: new Date("2023-01-01"),
        assets: [
          {
            id: "1",
            filename: "test-app-osx-64.dmg",
            size: 1024,
            content_type: "application/octet-stream",
            type: "osx_64" as any,
            raw: {
              browser_download_url: "https://example.com/download1",
              download_count: 100,
            },
          },
          {
            id: "2",
            filename: "test-app-windows-32.exe",
            size: 2048,
            content_type: "application/octet-stream",
            type: "windows_32" as any,
            raw: {
              browser_download_url: "https://example.com/download2",
              download_count: 200,
            },
          },
        ],
      });

      this.mockReleases = new PecansReleases([mockRelease]);
    }
    return this.mockReleases;
  }

  getRefreshWebhookMiddleware(path: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      next();
    };
  }
}

// Mock Express Request and Response
const createMockRequest = (overrides: Partial<Request> = {}): Request =>
  ({
    method: "GET",
    url: "/test",
    originalUrl: "/test",
    protocol: "http",
    get: vi.fn().mockReturnValue("localhost:3000"),
    params: {},
    query: {},
    ...overrides,
  }) as any;

const createMockResponse = (acceptHeader?: string): Response => {
  const mockRes: any = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
    attachment: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    format: vi.fn().mockImplementation((formats: any) => {
      // Simulate Express.js res.format() behavior
      if (acceptHeader === "application/json" && formats["application/json"]) {
        formats["application/json"]();
      } else if (formats.default) {
        formats.default();
      }
      return mockRes;
    }),
  };
  return mockRes;
};

const createMockNext = (): NextFunction => vi.fn();

describe("Pecans", () => {
  let mockBackend: MockBackend;
  let pecans: Pecans;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBackend = new MockBackend({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Custom Error Classes", () => {
    describe("UnsupportedPlatformError", () => {
      it("should create error with platform message", () => {
        const error = new UnsupportedPlatformError("invalid_platform");
        expect(error.message).toContain(
          "Unsupported platform (invalid_platform)",
        );
        expect(error.message).toContain("expected one of");
      });

      it("should handle undefined platform", () => {
        const error = new UnsupportedPlatformError(undefined);
        expect(error.message).toContain("Unsupported platform (undefined)");
      });

      it("should handle null platform", () => {
        const error = new UnsupportedPlatformError(null);
        expect(error.message).toContain("Unsupported platform (null)");
      });
    });

    describe("UnsupportedChannelError", () => {
      it("should create error with channel message", () => {
        const error = new UnsupportedChannelError("invalid_channel");
        expect(error.message).toContain(
          "Unsupported channel (invalid_channel)",
        );
        expect(error.message).toContain("expected a single string");
      });

      it("should handle array channel", () => {
        const error = new UnsupportedChannelError(["stable", "beta"]);
        expect(error.message).toContain("Unsupported channel");
      });

      it("should handle object channel", () => {
        const error = new UnsupportedChannelError({ channel: "test" });
        expect(error.message).toContain("Unsupported channel");
      });
    });

    describe("UnsupportedTagError", () => {
      it("should create error with tag message", () => {
        const error = new UnsupportedTagError(123);
        expect(error.message).toContain("Unsupported tag (123)");
        expect(error.message).toContain("expected 'latest' or a semver range");
      });

      it("should handle array tag", () => {
        const error = new UnsupportedTagError(["v1.0.0"]);
        expect(error.message).toContain("Unsupported tag");
      });
    });
  });

  describe("Validation Functions", () => {
    describe("validateReqQueryChannel", () => {
      it("should return string channel", () => {
        expect(validateReqQueryChannel("stable")).toBe("stable");
        expect(validateReqQueryChannel("beta")).toBe("beta");
        expect(validateReqQueryChannel("*")).toBe("*");
      });

      it("should throw UnsupportedChannelError for non-string", () => {
        expect(() => validateReqQueryChannel(["stable"])).toThrow(
          UnsupportedChannelError,
        );
        expect(() => validateReqQueryChannel({ channel: "stable" })).toThrow(
          UnsupportedChannelError,
        );
        expect(() => validateReqQueryChannel(123 as any)).toThrow(
          UnsupportedChannelError,
        );
      });

      it("should throw UnsupportedChannelError for nested ParsedQs", () => {
        const nestedQs = { nested: { value: "stable" } } as ParsedQs;
        expect(() => validateReqQueryChannel(nestedQs)).toThrow(
          UnsupportedChannelError,
        );
      });
    });

    describe("validateReqQueryPlatform", () => {
      it("should return valid platform", () => {
        expect(validateReqQueryPlatform("osx_64")).toBe("osx_64");
        expect(validateReqQueryPlatform("windows_32")).toBe("windows_32");
        expect(validateReqQueryPlatform("linux_64")).toBe("linux_64");
      });

      it("should throw UnsupportedPlatformError for undefined", () => {
        expect(() => validateReqQueryPlatform(undefined)).toThrow(
          UnsupportedPlatformError,
        );
      });

      it("should throw UnsupportedPlatformError for invalid platform", () => {
        expect(() => validateReqQueryPlatform("invalid")).toThrow(
          UnsupportedPlatformError,
        );
        expect(() => validateReqQueryPlatform(["osx_64"])).toThrow(
          UnsupportedPlatformError,
        );
        expect(() => validateReqQueryPlatform(123 as any)).toThrow(
          UnsupportedPlatformError,
        );
      });

      it("should throw UnsupportedPlatformError for nested ParsedQs", () => {
        const nestedQs = { nested: { value: "osx_64" } } as ParsedQs;
        expect(() => validateReqQueryPlatform(nestedQs)).toThrow(
          UnsupportedPlatformError,
        );
      });
    });

    describe("validateReqQueryTag", () => {
      it("should return valid semver tag", () => {
        expect(validateReqQueryTag("1.0.0")).toBe("1.0.0");
        expect(validateReqQueryTag(">=1.0.0")).toBe(">=1.0.0");
        expect(validateReqQueryTag("^1.0.0")).toBe("^1.0.0");
      });

      it("should return undefined for undefined", () => {
        expect(validateReqQueryTag(undefined)).toBeUndefined();
      });

      it("should throw UnsupportedTagError for non-string", () => {
        expect(() => validateReqQueryTag(["1.0.0"])).toThrow(
          UnsupportedTagError,
        );
        expect(() => validateReqQueryTag({ tag: "1.0.0" })).toThrow(
          UnsupportedTagError,
        );
        expect(() => validateReqQueryTag(123 as any)).toThrow(
          UnsupportedTagError,
        );
      });

      it("should allow the 'latest' keyword", () => {
        expect(validateReqQueryTag("latest")).toBe("latest");
      });

      it("should throw UnsupportedTagError for invalid semver ranges", () => {
        // previously validRange's result was discarded and invalid tags only
        // failed deep in release matching with a generic error
        expect(() => validateReqQueryTag("invalid-version")).toThrow(
          UnsupportedTagError,
        );
      });
    });

    describe("getStringValueFromRequestQuery", () => {
      it("should return string value from query", () => {
        const query = { param: "value" };
        expect(getStringValueFromRequestQuery(query, "param")).toBe("value");
      });

      it("should return undefined for missing param", () => {
        const query = {};
        expect(getStringValueFromRequestQuery(query, "param")).toBeUndefined();
      });

      it("should return undefined for non-string value", () => {
        const query = { param: ["value1", "value2"] };
        expect(getStringValueFromRequestQuery(query, "param")).toBeUndefined();
      });

      it("should return undefined for object value", () => {
        const query = { param: { nested: "value" } };
        expect(getStringValueFromRequestQuery(query, "param")).toBeUndefined();
      });

      it("should return undefined for empty string (falsy values)", () => {
        const query = { param: "" };
        expect(getStringValueFromRequestQuery(query, "param")).toBeUndefined();
      });
    });

    describe("getVersionFromQuery", () => {
      it("should return valid semver version", () => {
        const query = { version: "1.0.0" };
        expect(getVersionFromQuery(query)).toBe("1.0.0");
      });

      it("should return 'latest'", () => {
        const query = { version: "latest" };
        expect(getVersionFromQuery(query)).toBe("latest");
      });

      it("should return valid semver range", () => {
        const query = { version: ">=1.0.0" };
        expect(getVersionFromQuery(query)).toBe(">=1.0.0");
      });

      it("should return undefined for invalid version", () => {
        const query = { version: "invalid" };
        expect(getVersionFromQuery(query)).toBeUndefined();
      });

      it("should return undefined for missing version", () => {
        const query = {};
        expect(getVersionFromQuery(query)).toBeUndefined();
      });

      it("should return undefined for non-string version", () => {
        const query = { version: ["1.0.0"] };
        expect(getVersionFromQuery(query)).toBeUndefined();
      });
    });

    describe("getFilenameFromQuery", () => {
      it("should return filename from query", () => {
        const query = { filename: "app.dmg" };
        expect(getFilenameFromQuery(query)).toBe("app.dmg");
      });

      it("should return undefined for missing filename", () => {
        const query = {};
        expect(getFilenameFromQuery(query)).toBeUndefined();
      });

      it("should return undefined for non-string filename", () => {
        const query = { filename: ["app.dmg"] };
        expect(getFilenameFromQuery(query)).toBeUndefined();
      });
    });

    describe("getFiletypeFromQuery", () => {
      it("should return valid file extension", () => {
        const query = { filetype: ".dmg" };
        expect(getFiletypeFromQuery(query)).toBe(".dmg");
      });

      it("should add dot prefix to extension", () => {
        const query = { filetype: "dmg" };
        expect(getFiletypeFromQuery(query)).toBe(".dmg");
      });

      it("should throw for invalid extension", () => {
        const query = { filetype: "invalid" };
        expect(() => getFiletypeFromQuery(query)).toThrowError(
          "Unsupported FileType Requested",
        );
      });

      it("should return undefined for missing filetype", () => {
        const query = {};
        expect(getFiletypeFromQuery(query)).toBeUndefined();
      });

      it("should return undefined for non-string filetype", () => {
        const query = { filetype: [".dmg"] };
        expect(getFiletypeFromQuery(query)).toBeUndefined();
      });
    });

    describe("getPlatformFromQuery", () => {
      it("should return valid platform from query", () => {
        const query = { platform: "osx_64" };
        expect(getPlatformFromQuery(query)).toBe("osx_64");
      });

      it("should return undefined for invalid platform", () => {
        const query = { platform: "invalid" };
        expect(getPlatformFromQuery(query)).toBeUndefined();
      });

      it("should return undefined for missing platform", () => {
        const query = {};
        expect(getPlatformFromQuery(query)).toBeUndefined();
      });

      it("should return undefined for non-string platform", () => {
        const query = { platform: ["osx_64"] };
        expect(getPlatformFromQuery(query)).toBeUndefined();
      });
    });
  });

  describe("Pecans Class", () => {
    describe("constructor", () => {
      it("should create instance with default options", () => {
        pecans = new Pecans(mockBackend);
        expect(pecans).toBeInstanceOf(Pecans);
        expect(pecans.router).toBeDefined();
        expect(pecans.versions).toBeDefined();
      });

      it("should merge custom options with defaults", () => {
        const customOpts: PecansOptions = {
          timeout: 30000,
          basePath: "/api",
          cacheMaxAge: 1800,
          preferUniversal: false,
          includeVersionInReleaseNotes: true,
        };
        pecans = new Pecans(mockBackend, customOpts);
        expect(pecans).toBeInstanceOf(Pecans);
      });

      it("should handle null/undefined options", () => {
        pecans = new Pecans(mockBackend, undefined);
        expect(pecans).toBeInstanceOf(Pecans);
      });

      it("should set default values for missing required options", () => {
        const opts = {
          timeout: 0,
          cacheMaxAge: 0,
          basePath: "",
        } as PecansOptions;
        pecans = new Pecans(mockBackend, opts);
        expect(pecans).toBeInstanceOf(Pecans);
      });

      it("should have correct default values", () => {
        expect(Pecans.defaults.timeout).toBe(60 * 60 * 1000);
        expect(Pecans.defaults.cacheMaxAge).toBe(60 * 60 * 2);
        expect(Pecans.defaults.basePath).toBe("");
        expect(Pecans.defaults.preferUniversal).toBe(true);
        expect(Pecans.defaults.includeVersionInReleaseNotes).toBe(false);
      });
    });

    describe("API endpoints", () => {
      beforeEach(() => {
        pecans = new Pecans(mockBackend);
      });

      describe("handleApiChannels", () => {
        it("should return channels list", async () => {
          const req = createMockRequest();
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleApiChannels(req, res, next);

          expect(res.json).toHaveBeenCalledWith([
            expect.objectContaining({
              name: "stable",
            }),
          ]);
          expect(next).not.toHaveBeenCalled();
        });

        it("should call next with error on failure", async () => {
          const req = createMockRequest();
          const res = createMockResponse();
          const next = createMockNext();

          // Make backend throw error
          mockBackend.mockReleases = null;
          vi.spyOn(mockBackend, "releases").mockRejectedValueOnce(
            new Error("Backend error"),
          );

          await (pecans as any).handleApiChannels(req, res, next);

          expect(next).toHaveBeenCalledWith(new Error("Backend error"));
          expect(res.json).not.toHaveBeenCalled();
        });
      });

      describe("handleApiStatus", () => {
        it("should return uptime status", async () => {
          const req = createMockRequest();
          const res = createMockResponse();
          const next = createMockNext();

          // Simulate some uptime
          await new Promise((resolve) => setTimeout(resolve, 10));

          await (pecans as any).handleApiStatus(req, res, next);

          expect(res.send).toHaveBeenCalledWith({
            uptime: expect.any(Number),
          });
          expect(next).not.toHaveBeenCalled();
        });

        it("should call next with error on failure", async () => {
          const req = createMockRequest();
          const res = createMockResponse();
          const next = createMockNext();

          // Mock res.send to throw
          res.send = vi.fn().mockImplementationOnce(() => {
            throw new Error("Response error");
          });

          await (pecans as any).handleApiStatus(req, res, next);

          expect(next).toHaveBeenCalledWith(new Error("Response error"));
        });
      });

      describe("handleApiVersions", () => {
        it("should return filtered versions with default parameters", async () => {
          const req = createMockRequest({
            query: {},
          });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleApiVersions(req, res, next);

          expect(res.send).toHaveBeenCalledWith(expect.any(Array));
          expect(next).not.toHaveBeenCalled();
        });

        it("should handle channel parameter", async () => {
          const req = createMockRequest({
            query: { channel: "stable" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleApiVersions(req, res, next);

          expect(res.send).toHaveBeenCalledWith(expect.any(Array));
          expect(next).not.toHaveBeenCalled();
        });

        it("should handle platform parameter", async () => {
          const req = createMockRequest({
            query: { platform: "osx_64" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleApiVersions(req, res, next);

          expect(res.send).toHaveBeenCalledWith(expect.any(Array));
          expect(next).not.toHaveBeenCalled();
        });

        it("should handle version parameter", async () => {
          const req = createMockRequest({
            query: { version: ">=1.0.0" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleApiVersions(req, res, next);

          expect(res.send).toHaveBeenCalledWith(expect.any(Array));
          expect(next).not.toHaveBeenCalled();
        });

        it("should call next with error for invalid channel", async () => {
          const req = createMockRequest({
            query: { channel: ["invalid"] },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleApiVersions(req, res, next);

          expect(next).toHaveBeenCalledWith(
            expect.any(UnsupportedChannelError),
          );
          expect(res.send).not.toHaveBeenCalled();
        });

        it("should call next with error on filter failure", async () => {
          const req = createMockRequest({
            query: {},
          });
          const res = createMockResponse();
          const next = createMockNext();

          // Make versions.filter throw
          vi.spyOn(pecans.versions, "filter").mockRejectedValueOnce(
            new Error("Filter error"),
          );

          await (pecans as any).handleApiVersions(req, res, next);

          expect(next).toHaveBeenCalledWith(new Error("Filter error"));
          expect(res.send).not.toHaveBeenCalled();
        });
      });
    });

    describe("Utility methods", () => {
      beforeEach(() => {
        pecans = new Pecans(mockBackend);
      });

      describe("getBaseUrl", () => {
        it("should construct base URL from request", () => {
          const req = createMockRequest({
            protocol: "https",
            get: vi.fn().mockReturnValue("example.com:443"),
          });

          const result = (pecans as any).getBaseUrl(req);
          expect(result).toBe("https://example.com:443");
        });

        it("should include basePath in URL", () => {
          pecans = new Pecans(mockBackend, { basePath: "/api/v1" });
          const req = createMockRequest({
            protocol: "http",
            get: vi.fn().mockReturnValue("localhost:3000"),
          });

          const result = (pecans as any).getBaseUrl(req);
          expect(result).toBe("http://localhost:3000/api/v1");
        });
      });

      describe("getFullUrl", () => {
        it("should combine base URL with original URL", () => {
          const req = createMockRequest({
            protocol: "https",
            get: vi.fn().mockReturnValue("example.com"),
            originalUrl: "/download/latest",
          });

          const result = (pecans as any).getFullUrl(req);
          expect(result).toBe("https://example.com/download/latest");
        });
      });

      describe("getReleases", () => {
        it("should delegate to backend", async () => {
          const releases = await pecans.getReleases();
          expect(releases).toBeInstanceOf(PecansReleases);
        });
      });

      describe("queryReleases", () => {
        it("should query releases with given criteria", async () => {
          const query = { version: "1.0.0" };
          const releases = await pecans.queryReleases(query);
          expect(releases).toBeInstanceOf(Array);
        });
      });

      describe("validateChannelName", () => {
        it("should validate existing channel names", async () => {
          await expect(
            pecans.validateChannelName("stable"),
          ).resolves.not.toThrow();
        });

        it("should throw error for invalid channel names", async () => {
          await expect(
            pecans.validateChannelName("nonexistent"),
          ).rejects.toThrow("Invalid Channel: nonexistent");
        });
      });

      describe("getChannelFromQuery", () => {
        it("should return valid channel from query", async () => {
          const query = { channel: "stable" };
          const result = await pecans.getChannelFromQuery(query);
          expect(result).toBe("stable");
        });

        it("should default to stable channel", async () => {
          const query = {};
          const result = await pecans.getChannelFromQuery(query);
          expect(result).toBe("stable");
        });

        it("should return undefined for invalid channels", async () => {
          const query = { channel: "invalid" };
          const result = await pecans.getChannelFromQuery(query);
          expect(result).toBeUndefined();
        });

        it("should handle non-string channel values", async () => {
          const query = { channel: ["stable"] };
          const result = await pecans.getChannelFromQuery(query);
          expect(result).toBe("stable");
        });
      });

      describe("serveAsset", () => {
        it("should emit events and call backend serveAsset", async () => {
          const req = createMockRequest();
          const res = createMockResponse();
          const release = { version: "1.0.0" };
          const asset = { filename: "test.dmg" };

          const beforeSpy = vi.fn();
          const afterSpy = vi.fn();
          pecans.on("beforeDownload", beforeSpy);
          pecans.on("afterDownload", afterSpy);

          await (pecans as any).serveAsset(req, res, release, asset);

          expect(beforeSpy).toHaveBeenCalledWith({
            req,
            version: release,
            platform: asset,
          });
          expect(afterSpy).toHaveBeenCalledWith({
            req,
            version: release,
            platform: asset,
          });
        });
      });
    });

    describe("Download endpoints", () => {
      beforeEach(() => {
        pecans = new Pecans(mockBackend);
      });

      describe("dlfilename", () => {
        it("should serve asset by filename", async () => {
          const req = createMockRequest({
            params: { filename: "test-app-osx-64.dmg" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          vi.spyOn(pecans as any, "serveAsset").mockResolvedValue(undefined);

          await pecans.dlfilename(req, res, next);

          expect((pecans as any).serveAsset).toHaveBeenCalled();
          expect(next).not.toHaveBeenCalled();
        });

        it("should return 404 for non-existent filename", async () => {
          const req = createMockRequest({
            params: { filename: "nonexistent.dmg" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await pecans.dlfilename(req, res, next);

          expect(res.status).toHaveBeenCalledWith(404);
          expect(res.send).toHaveBeenCalledWith("nonexistent.dmg not found");
        });

        it("should return 404 when no matching assets", async () => {
          // Create release with no matching assets
          const mockReleaseWithNoAssets = new PecansRelease({
            version: "2.0.0",
            channel: "stable",
            notes: "Test",
            published_at: new Date(),
            assets: [],
          });
          mockBackend.mockReleases = new PecansReleases([
            mockReleaseWithNoAssets,
          ]);

          const req = createMockRequest({
            params: { filename: "test.dmg" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await pecans.dlfilename(req, res, next);

          expect(res.status).toHaveBeenCalledWith(404);
          expect(res.send).toHaveBeenCalledWith("test.dmg not found");
        });

        it("should return 404 when release exists but no matching assets for filename", async () => {
          // Create release with assets that don't match the requested filename
          const mockReleaseWithDifferentAssets = new PecansRelease({
            version: "1.0.0",
            channel: "stable",
            notes: "Test",
            published_at: new Date(),
            assets: [
              {
                id: "1",
                filename: "different-file.exe",
                size: 1024,
                content_type: "application/octet-stream",
                type: "windows_32" as any,
                raw: {},
              },
            ],
          });
          mockBackend.mockReleases = new PecansReleases([
            mockReleaseWithDifferentAssets,
          ]);

          const req = createMockRequest({
            params: { filename: "requested-file.dmg" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await pecans.dlfilename(req, res, next);

          expect(res.status).toHaveBeenCalledWith(404);
          expect(res.send).toHaveBeenCalledWith("requested-file.dmg not found");
        });

        it("should call next with error on exception", async () => {
          const req = createMockRequest({
            params: { filename: "test.dmg" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          vi.spyOn(pecans, "getReleases").mockRejectedValueOnce(
            new Error("Backend error"),
          );

          await pecans.dlfilename(req, res, next);

          expect(next).toHaveBeenCalledWith(new Error("Backend error"));
        });

        it("should handle defensive case where queryAssets returns empty despite queryReleases match (approach 4)", async () => {
          const req = createMockRequest({
            params: { filename: "test.dmg" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          // Create a release that matches filename query but has assets that don't match
          const mockRelease = new PecansRelease({
            version: "1.0.0",
            channel: "stable",
            notes: "Test",
            published_at: new Date(),
            assets: [
              {
                id: "1",
                filename: "test.dmg",
                size: 1024,
                content_type: "application/octet-stream",
                type: "osx_64" as any,
                raw: {},
              },
            ],
          });

          // Mock releases to return our test release
          const mockReleases = new PecansReleases([mockRelease]);
          mockBackend.mockReleases = mockReleases;

          // Override queryAssets to return empty array despite having matching assets
          // This tests the defensive check at lines 279-281
          mockRelease.queryAssets = vi.fn(() => []);

          // Mock queryReleases to return the same mocked release instance
          const queryReleasesSpy = vi.spyOn(mockReleases, "queryReleases");
          queryReleasesSpy.mockImplementation(() => [mockRelease]);

          await pecans.dlfilename(req, res, next);

          expect(res.status).toHaveBeenCalledWith(404);
          expect(res.send).toHaveBeenCalledWith("test.dmg not found");
          expect(mockRelease.queryAssets).toHaveBeenCalled();
        });
      });

      describe("dl", () => {
        it("should download asset by OS and arch", async () => {
          const req = createMockRequest({
            params: { os: "osx", arch: "64" },
            query: {},
          });
          const res = createMockResponse();
          const next = createMockNext();

          vi.spyOn(pecans as any, "serveAsset").mockResolvedValue(undefined);

          await pecans.dl(req, res, next);

          expect((pecans as any).serveAsset).toHaveBeenCalled();
          expect(next).not.toHaveBeenCalled();
        });

        it("should return 404 for invalid OS", async () => {
          const req = createMockRequest({
            params: { os: "invalid", arch: "64" },
            query: {},
          });
          const res = createMockResponse();
          const next = createMockNext();

          await pecans.dl(req, res, next);

          expect(res.status).toHaveBeenCalledWith(404);
          expect(res.send).toHaveBeenCalledWith(
            expect.stringContaining("Unrecognized OS"),
          );
        });

        it("should return 404 for invalid architecture", async () => {
          const req = createMockRequest({
            params: { os: "osx", arch: "invalid" },
            query: {},
          });
          const res = createMockResponse();
          const next = createMockNext();

          await pecans.dl(req, res, next);

          expect(res.status).toHaveBeenCalledWith(404);
          expect(res.send).toHaveBeenCalledWith(
            expect.stringContaining("Unsupported Arch"),
          );
        });

        it("should return 404 when no matching releases", async () => {
          // Create releases that exist but won't match the query due to different OS
          const mockReleaseWithDifferentOS = new PecansRelease({
            version: "1.0.0",
            channel: "stable",
            notes: "Test",
            published_at: new Date(),
            assets: [
              {
                id: "1",
                filename: "test-app-linux-64.deb", // Linux asset
                size: 1024,
                content_type: "application/octet-stream",
                type: "linux_64" as any,
                raw: {},
              },
            ],
          });
          mockBackend.mockReleases = new PecansReleases([
            mockReleaseWithDifferentOS,
          ]);

          const req = createMockRequest({
            params: { os: "windows", arch: "32" }, // Request Windows, but only Linux release exists
            query: { channel: "stable" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await pecans.dl(req, res, next);

          expect(res.status).toHaveBeenCalledWith(404);
          expect(res.send).toHaveBeenCalledWith("No Matching Releases Found");
        });

        it("should return 404 when no matching assets", async () => {
          // Mock release with no matching assets for the platform
          const mockReleaseWithDifferentAssets = new PecansRelease({
            version: "1.0.0",
            channel: "stable",
            notes: "Test",
            published_at: new Date(),
            assets: [
              {
                id: "1",
                filename: "test-windows.exe",
                size: 1024,
                content_type: "application/octet-stream",
                type: "windows_32" as any,
                raw: {},
              },
            ],
          });
          mockBackend.mockReleases = new PecansReleases([
            mockReleaseWithDifferentAssets,
          ]);

          const req = createMockRequest({
            params: { os: "osx", arch: "64" },
            query: {},
          });
          const res = createMockResponse();
          const next = createMockNext();

          await pecans.dl(req, res, next);

          expect(res.status).toHaveBeenCalledWith(404);
          expect(res.send).toHaveBeenCalledWith("No Matching Releases Found");
        });

        it("should return 404 when release exists but no matching assets for query", async () => {
          // Create release with Linux asset that has unsupported extension for the requested pkg format
          const mockReleaseWithWrongExtension = new PecansRelease({
            version: "1.0.0",
            channel: "stable",
            notes: "Test",
            published_at: new Date(),
            assets: [
              {
                id: "1",
                filename: "test-app-linux-64.zip", // .zip extension for Linux - not in default extensions
                size: 1024,
                content_type: "application/octet-stream",
                type: "linux_64" as any,
                raw: {},
              },
            ],
          });
          mockBackend.mockReleases = new PecansReleases([
            mockReleaseWithWrongExtension,
          ]);

          const req = createMockRequest({
            params: { os: "linux", arch: "64" },
            query: {
              channel: "stable",
              // No pkg specified - will use default extensions [".tgz", ".tar.gz"] but we have .zip
            },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await pecans.dl(req, res, next);

          expect(res.status).toHaveBeenCalledWith(404);
          expect(res.send).toHaveBeenCalledWith("No Matching Assets Found");
        });

        it("should handle version parameter", async () => {
          const req = createMockRequest({
            params: { os: "osx", arch: "64" },
            query: { version: "1.0.0" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          vi.spyOn(pecans as any, "serveAsset").mockResolvedValue(undefined);

          await pecans.dl(req, res, next);

          expect((pecans as any).serveAsset).toHaveBeenCalled();
        });

        it("should handle pkg parameter", async () => {
          // Create release with Linux deb assets
          const mockReleaseWithLinuxAssets = new PecansRelease({
            version: "1.0.0",
            channel: "stable",
            notes: "Test",
            published_at: new Date(),
            assets: [
              {
                id: "1",
                filename: "test-app-linux-amd64.deb",
                size: 1024,
                content_type: "application/octet-stream",
                type: "linux_deb_64" as any,
                raw: {},
              },
            ],
          });
          mockBackend.mockReleases = new PecansReleases([
            mockReleaseWithLinuxAssets,
          ]);

          const req = createMockRequest({
            params: { os: "linux", arch: "64" },
            query: { pkg: "deb" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          vi.spyOn(pecans as any, "serveAsset").mockResolvedValue(undefined);

          await pecans.dl(req, res, next);

          expect((pecans as any).serveAsset).toHaveBeenCalled();
        });

        it("should call next with error on exception", async () => {
          const req = createMockRequest({
            params: { os: "osx", arch: "64" },
            query: {},
          });
          const res = createMockResponse();
          const next = createMockNext();

          vi.spyOn(pecans, "queryReleases").mockRejectedValueOnce(
            new Error("Query error"),
          );

          await pecans.dl(req, res, next);

          expect(next).toHaveBeenCalledWith(new Error("Query error"));
        });
      });

      describe("handleDownload", () => {
        it("should 400 when no platform is specified (autodetection removed in 2.0)", async () => {
          const req = createMockRequest({ query: {} });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleDownload(req, res, next);

          expect(res.status).toHaveBeenCalledWith(400);
        });

        it("should handle download with explicit platform parameter", async () => {
          const req = createMockRequest({
            params: { platform: "osx_64" },
            query: {},
          });
          const res = createMockResponse();
          const next = createMockNext();

          vi.spyOn(pecans as any, "serveAsset").mockResolvedValue(undefined);

          await (pecans as any).handleDownload(req, res, next);

          expect((pecans as any).serveAsset).toHaveBeenCalled();
        });

        it("should handle download with filename parameter", async () => {
          const req = createMockRequest({
            params: { filename: "test-app-osx-64.dmg" },
            query: {},
          });
          const res = createMockResponse();
          const next = createMockNext();

          vi.spyOn(pecans as any, "serveAsset").mockResolvedValue(undefined);

          await (pecans as any).handleDownload(req, res, next);

          expect((pecans as any).serveAsset).toHaveBeenCalled();
        });

        it("should handle channel parameter", async () => {
          const req = createMockRequest({
            params: { platform: "osx_64" },
            query: { channel: "beta" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          vi.spyOn(pecans as any, "serveAsset").mockResolvedValue(undefined);

          await (pecans as any).handleDownload(req, res, next);

          expect((pecans as any).serveAsset).toHaveBeenCalled();
        });

        it("should handle tag parameter", async () => {
          const req = createMockRequest({
            params: { platform: "osx_64" },
            query: { tag: "1.0.0" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          vi.spyOn(pecans as any, "serveAsset").mockResolvedValue(undefined);

          await (pecans as any).handleDownload(req, res, next);

          expect((pecans as any).serveAsset).toHaveBeenCalled();
        });

        it("should handle filetype parameter", async () => {
          const req = createMockRequest({
            params: { platform: "osx_64" },
            query: { filetype: "zip" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          vi.spyOn(pecans as any, "serveAsset").mockResolvedValue(undefined);

          await (pecans as any).handleDownload(req, res, next);

          expect((pecans as any).serveAsset).toHaveBeenCalled();
        });

        it("should throw error for unsupported filetype", async () => {
          const req = createMockRequest({
            params: { platform: "osx_64" },
            query: { filetype: "unsupported" }, // This will be filtered out by getFiletypeFromQuery
          });
          const res = createMockResponse();
          const next = createMockNext();

          vi.spyOn(pecans as any, "serveAsset").mockResolvedValue(undefined);

          await (pecans as any).handleDownload(req, res, next);
          expect(next).toHaveBeenCalledWith(expect.any(Error));
        });

        it("should 400 when platform is required but not provided", async () => {
          pecans = new Pecans(mockBackend);
          const req = createMockRequest({
            query: {},
            params: {},
          });
          const res = createMockResponse();
          const next = createMockNext();
          await (pecans as any).handleDownload(req, res, next);
          expect(res.status).toHaveBeenCalledWith(400);
          expect(next).not.toHaveBeenCalled();
        });

        it("should throw error when no asset found", async () => {
          const req = createMockRequest({
            params: { platform: "osx_64" },
            query: {},
          });
          const res = createMockResponse();
          const next = createMockNext();

          vi.spyOn(pecans.versions, "resolve").mockResolvedValueOnce({
            version: "1.0.0",
            assets: [],
          } as any);

          await (pecans as any).handleDownload(req, res, next);

          expect(next).toHaveBeenCalledWith(expect.any(Error));
        });

        it("should use fallback channel '*' when initial resolve fails with no channel and tag=latest", async () => {
          const req = createMockRequest({
            params: { platform: "osx_64" },
            query: { tag: "latest", channel: undefined },
          });
          const res = createMockResponse();
          const next = createMockNext();

          let callCount = 0;
          const resolveSpy = vi
            .spyOn(pecans.versions, "resolve")
            .mockImplementation(async (opts) => {
              callCount++;
              // Log the arguments for debug

              console.log(`resolve call ${callCount}:`, opts);
              if (callCount === 1) {
                throw new Error("First resolve failed");
              }
              return new PecansRelease({
                version: "1.0.0",
                channel: "stable",
                notes: "Test release notes",
                published_at: new Date(),
                assets: [
                  {
                    id: "1",
                    filename: "test-app-osx-64.dmg",
                    size: 1024,
                    content_type: "application/octet-stream",
                    type: "osx_64" as any,
                    raw: {
                      browser_download_url: "https://example.com/download1",
                      download_count: 100,
                    },
                  },
                ],
              });
            });
          vi.spyOn(pecans as any, "serveAsset").mockResolvedValue(undefined);

          await (pecans as any).handleDownload(req, res, next);

          // Assert two calls to resolve (fallback triggered)
          expect(resolveSpy).toHaveBeenCalledTimes(2);
          expect(callCount).toBe(2);
          // Fallback call should use channel="*"
          expect(resolveSpy).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ channel: "*" }),
          );
          expect((pecans as any).serveAsset).toHaveBeenCalled();
        });

        it("should not use fallback when channel is '*' (covers line 469 branch)", async () => {
          const req = createMockRequest({
            params: { platform: "osx_64" },
            query: { tag: "latest", channel: "*" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          const resolveSpy = vi
            .spyOn(pecans.versions, "resolve")
            .mockImplementation(async (opts) => {
              throw new Error("Resolution failed");
            });

          await (pecans as any).handleDownload(req, res, next);

          // Should not attempt fallback when channel is '*'
          expect(resolveSpy).toHaveBeenCalledTimes(1);
          expect(next).toHaveBeenCalledWith(expect.any(Error));
          resolveSpy.mockRestore();
        });
      });
    });

    describe("Update endpoints", () => {
      beforeEach(() => {
        pecans = new Pecans(mockBackend);
      });

      describe("handleUpdateRedirect", () => {
        it("should redirect with platform and version parameters", () => {
          const req = createMockRequest({
            query: { platform: "osx_64", version: "1.0.0" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          (pecans as any).handleUpdateRedirect(req, res, next);

          expect(res.redirect).toHaveBeenCalledWith("/update/osx_64/1.0.0");
          expect(next).not.toHaveBeenCalled();
        });

        it("should call next with error when version is missing", () => {
          const req = createMockRequest({
            query: { platform: "osx_64" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          (pecans as any).handleUpdateRedirect(req, res, next);

          expect(next).toHaveBeenCalledWith(expect.any(Error));
          expect(res.redirect).not.toHaveBeenCalled();
        });

        it("should call next with error when platform is missing", () => {
          const req = createMockRequest({
            query: { version: "1.0.0" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          (pecans as any).handleUpdateRedirect(req, res, next);

          expect(next).toHaveBeenCalledWith(expect.any(Error));
          expect(res.redirect).not.toHaveBeenCalled();
        });
      });

      describe("handleUpdateOSX", () => {
        it("should return 204 when no updates available", async () => {
          // Mock versions.filter to return empty array
          vi.spyOn(pecans.versions, "filter").mockResolvedValueOnce([]);

          const req = createMockRequest({
            params: { platform: "osx_64", version: "1.0.0" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleUpdateOSX(req, res, next);

          expect(res.status).toHaveBeenCalledWith(204);
          expect(res.send).toHaveBeenCalledWith("No updates");
        });

        it("should return 204 when current version is latest", async () => {
          const mockRelease = { version: "1.0.0", published_at: new Date() };
          vi.spyOn(pecans.versions, "filter").mockResolvedValueOnce([
            mockRelease,
          ] as any);

          const req = createMockRequest({
            params: { platform: "osx_64", version: "1.0.0" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleUpdateOSX(req, res, next);

          expect(res.status).toHaveBeenCalledWith(204);
          expect(res.send).toHaveBeenCalledWith("No updates");
        });

        it("should return update information when newer version available", async () => {
          const mockReleases = [
            {
              version: "2.0.0",
              published_at: new Date(),
              notes: "New version",
            },
            {
              version: "1.0.0",
              published_at: new Date(),
              notes: "Old version",
            },
          ];
          vi.spyOn(pecans.versions, "filter").mockResolvedValueOnce(
            mockReleases as any,
          );

          const req = createMockRequest({
            params: { platform: "osx_64", version: "1.0.0" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleUpdateOSX(req, res, next);

          expect(res.status).toHaveBeenCalledWith(200);
          expect(res.send).toHaveBeenCalledWith(
            expect.objectContaining({
              url: expect.stringContaining("/download/version/2.0.0/osx_64"),
              name: "2.0.0",
              notes: expect.any(String),
              pub_date: expect.any(String),
            }),
          );
        });

        it("should handle channel parameter", async () => {
          const mockReleases = [
            {
              version: "2.0.0",
              published_at: new Date(),
              notes: "Beta version",
            },
          ];
          vi.spyOn(pecans.versions, "filter").mockResolvedValueOnce(
            mockReleases as any,
          );

          const req = createMockRequest({
            params: { platform: "osx_64", version: "1.0.0", channel: "beta" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleUpdateOSX(req, res, next);

          expect(res.status).toHaveBeenCalledWith(200);
          expect(res.send).toHaveBeenCalledWith(
            expect.objectContaining({
              name: "2.0.0",
            }),
          );
        });

        it("should handle filetype parameter", async () => {
          const mockReleases = [
            {
              version: "2.0.0",
              published_at: new Date(),
              notes: "New version",
            },
          ];
          vi.spyOn(pecans.versions, "filter").mockResolvedValueOnce(
            mockReleases as any,
          );

          const req = createMockRequest({
            params: { platform: "osx_64", version: "1.0.0" },
            query: { filetype: "dmg" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleUpdateOSX(req, res, next);

          expect(res.send).toHaveBeenCalledWith(
            expect.objectContaining({
              url: expect.stringContaining("filetype=dmg"),
            }),
          );
        });

        it("should call next with error on failure", async () => {
          vi.spyOn(pecans.versions, "filter").mockRejectedValueOnce(
            new Error("Filter error"),
          );

          const req = createMockRequest({
            params: { platform: "osx_64", version: "1.0.0" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleUpdateOSX(req, res, next);

          expect(next).toHaveBeenCalledWith(new Error("Filter error"));
        });
      });

      describe("handleUpdateWin", () => {
        it("should serve RELEASES file for Windows updates", async () => {
          const mockReleases = [
            {
              version: "1.0.0",
              assets: [{ filename: "RELEASES", id: "1" }],
            },
          ];
          vi.spyOn(pecans.versions, "filter").mockResolvedValueOnce(
            mockReleases as any,
          );
          vi.spyOn(mockBackend, "readAsset").mockResolvedValueOnce(
            Buffer.from(
              "DA39A3EE5E6B4B0D3255BFEF95601890AFD80709 test-1.0.0-full.nupkg 1024",
            ),
          );

          const req = createMockRequest({
            params: { platform: "windows_32", version: "1.0.0" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleUpdateWin(req, res, next);

          expect(res.header).toHaveBeenCalledWith(
            "Content-Length",
            expect.any(String),
          );
          expect(res.attachment).toHaveBeenCalledWith("RELEASES");
          expect(res.send).toHaveBeenCalled();
        });

        it("should handle channel parameter", async () => {
          const mockReleases = [
            {
              version: "1.0.0",
              assets: [{ filename: "RELEASES", id: "1" }],
            },
          ];
          vi.spyOn(pecans.versions, "filter").mockResolvedValueOnce(
            mockReleases as any,
          );
          vi.spyOn(mockBackend, "readAsset").mockResolvedValueOnce(
            Buffer.from("mock RELEASES content"),
          );

          const req = createMockRequest({
            params: {
              platform: "windows_32",
              version: "1.0.0",
              channel: "beta",
            },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleUpdateWin(req, res, next);

          expect(res.send).toHaveBeenCalled();
        });

        it("should throw error for invalid platform after mapping", async () => {
          pecans = new Pecans(mockBackend);
          const req = createMockRequest({
            params: { platform: "invalid", version: "1.0.0" },
          });
          const res = createMockResponse();
          const next = createMockNext();
          await (pecans as any).handleUpdateWin(req, res, next);
          expect((next as any).mock.calls[0][0]).toBeInstanceOf(Error);
        });

        it("should throw generic error when platform validation fails at runtime check", async () => {
          const req = createMockRequest({
            params: { platform: "windows_32", version: "1.0.0" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          // Import the module to mock isPlatform
          const platformsModule = await import("../../src/utils/platforms");
          const isPlatformSpy = vi
            .spyOn(platformsModule, "isPlatform")
            .mockReturnValueOnce(false);

          await (pecans as any).handleUpdateWin(req, res, next);

          expect(next).toHaveBeenCalledWith(expect.any(Error));
          // Should be UnsupportedPlatformError
          if (vi.isMockFunction(next)) {
            expect(next.mock.calls[0][0]).toBeInstanceOf(
              UnsupportedPlatformError,
            );
          }
          isPlatformSpy.mockRestore();
        });

        it("should throw error when no versions found", async () => {
          vi.spyOn(pecans.versions, "filter").mockResolvedValueOnce([]);

          const req = createMockRequest({
            params: { platform: "windows_32", version: "1.0.0" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleUpdateWin(req, res, next);

          expect(next).toHaveBeenCalledWith(expect.any(Error));
        });

        it("should throw error when RELEASES file not found", async () => {
          const mockReleases = [
            {
              version: "1.0.0",
              assets: [{ filename: "other.exe", id: "1" }],
            },
          ];
          vi.spyOn(pecans.versions, "filter").mockResolvedValueOnce(
            mockReleases as any,
          );

          const req = createMockRequest({
            params: { platform: "windows_32", version: "1.0.0" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleUpdateWin(req, res, next);

          expect(next).toHaveBeenCalledWith(expect.any(Error));
        });

        it("should call next with error on failure", async () => {
          vi.spyOn(pecans.versions, "filter").mockRejectedValueOnce(
            new Error("Filter error"),
          );

          const req = createMockRequest({
            params: { platform: "windows_32", version: "1.0.0" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleUpdateWin(req, res, next);

          expect(next).toHaveBeenCalledWith(new Error("Filter error"));
        });

        it("should throw error when version parameter is missing (covers line 534)", async () => {
          const req = createMockRequest({
            params: { platform: "osx_64" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleUpdateOSX(req, res, next);

          expect(next).toHaveBeenCalledWith(
            new Error('Requires "version" parameter'),
          );
        });

        it("should throw error when platform parameter is missing (covers line 536)", async () => {
          const req = createMockRequest({
            params: { version: "1.0.0" },
          });
          const res = createMockResponse();
          const next = createMockNext();

          await (pecans as any).handleUpdateOSX(req, res, next);

          expect(next).toHaveBeenCalledWith(
            new Error('Requires "platform" parameter'),
          );
        });
      });
    });

    describe("handleServeNotes", () => {
      beforeEach(() => {
        pecans = new Pecans(mockBackend);
      });

      it("should serve release notes with JSON format", async () => {
        const req = createMockRequest({
          query: { version: "1.0.0" },
        });
        const res = createMockResponse("application/json");
        const next = createMockNext();

        await (pecans as any).handleServeNotes(req, res, next);

        expect(res.format).toHaveBeenCalled();
        expect(res.send).toHaveBeenCalledWith({
          note: expect.stringContaining("1.0.0"),
        });
      });

      it("should serve release notes with default format", async () => {
        const req = createMockRequest({
          query: { version: "1.0.0" },
        });
        const res = createMockResponse("text/html");
        const next = createMockNext();

        await (pecans as any).handleServeNotes(req, res, next);

        expect(res.format).toHaveBeenCalled();
        expect(res.send).toHaveBeenCalledWith(expect.stringContaining("1.0.0"));
      });

      it("should handle missing version parameter", async () => {
        const req = createMockRequest({
          query: {},
        });
        const res = createMockResponse();
        const next = createMockNext();

        await (pecans as any).handleServeNotes(req, res, next);

        expect(res.format).toHaveBeenCalled();
      });

      it("should call next with error on failure", async () => {
        const req = createMockRequest({
          query: { version: "1.0.0" },
        });
        const res = createMockResponse();
        const next = createMockNext();

        vi.spyOn(pecans, "getReleases").mockRejectedValueOnce(
          new Error("Backend error"),
        );

        await (pecans as any).handleServeNotes(req, res, next);

        expect(next).toHaveBeenCalledWith(new Error("Backend error"));
      });
    });
  });
});
