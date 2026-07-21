import { Octokit } from "@octokit/rest";
import { Webhooks, createNodeMiddleware } from "@octokit/webhooks";
import type { Response } from "express";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type GithubReleaseAsset,
  GitHubBackend,
  PecansGitHubBackend,
  PecansGitHubBackendSettings,
} from "../../src/backends/github.js";

// Mock dependencies
vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(
    class {
      rest = { repos: { listReleases: vi.fn() } };
      paginate = vi.fn();
    },
  ),
}));

vi.mock("@octokit/webhooks", () => ({
  Webhooks: vi.fn(
    class {
      on = vi.fn();
    },
  ),
  createNodeMiddleware: vi.fn(),
}));

describe("PecansGitHubBackend", () => {
  let backend: PecansGitHubBackend;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  // Get references to mocked functions
  let mockOctokit: any;
  let mockWebhooks: any;
  const mockCreateNodeMiddleware = vi.mocked(createNodeMiddleware);
  // The backend uses the runtime's native global fetch; stub it per-test.
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Initialize fresh mock instances
    mockOctokit = {
      rest: { repos: { listReleases: vi.fn() } },
      paginate: vi.fn(),
    };
    mockWebhooks = { on: vi.fn() };

    // vitest 4 requires constructor mocks to be implemented with a class
    vi.mocked(Octokit).mockImplementation(
      class {
        constructor() {
          return mockOctokit;
        }
      } as unknown as typeof Octokit,
    );
    vi.mocked(Webhooks).mockImplementation(
      class {
        constructor() {
          return mockWebhooks;
        }
      } as unknown as typeof Webhooks,
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getEnvironment", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should return environment variables without prefix", () => {
      process.env.GITHUB_OWNER = "test-owner";
      process.env.GITHUB_REPO = "test-repo";
      process.env.GITHUB_TOKEN = "test-token";

      const env = PecansGitHubBackend.getEnvironment();

      expect(env.GITHUB_OWNER).toBe("test-owner");
      expect(env.GITHUB_REPO).toBe("test-repo");
      expect(env.GITHUB_TOKEN).toBe("test-token");
    });

    it("should return environment variables with prefix", () => {
      process.env.PREFIX_GITHUB_OWNER = "prefix-owner";
      process.env.PREFIX_GITHUB_REPO = "prefix-repo";
      process.env.PREFIX_GITHUB_TOKEN = "prefix-token";

      const env = PecansGitHubBackend.getEnvironment("PREFIX");

      expect(env.GITHUB_OWNER).toBe("prefix-owner");
      expect(env.GITHUB_REPO).toBe("prefix-repo");
      expect(env.GITHUB_TOKEN).toBe("prefix-token");
    });

    it("should throw error if GITHUB_OWNER is missing", () => {
      process.env.GITHUB_REPO = "test-repo";
      delete process.env.GITHUB_OWNER;

      expect(() => PecansGitHubBackend.getEnvironment()).toThrow(
        "GITHUB_OWNER environment variable is required.",
      );
    });

    it("should throw error if GITHUB_REPO is missing", () => {
      process.env.GITHUB_OWNER = "test-owner";
      delete process.env.GITHUB_REPO;

      expect(() => PecansGitHubBackend.getEnvironment()).toThrow(
        "GITHUB_REPO environment variable is required.",
      );
    });

    it("should warn if GITHUB_TOKEN is missing", () => {
      process.env.GITHUB_OWNER = "test-owner";
      process.env.GITHUB_REPO = "test-repo";
      delete process.env.GITHUB_TOKEN;

      const env = PecansGitHubBackend.getEnvironment();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "GITHUB_TOKEN environment variable was not provided, if your repo is private you will need to provide a token.",
      );
      expect(env.GITHUB_TOKEN).toBeUndefined();
    });

    it("should throw error with prefix if prefixed GITHUB_OWNER is missing", () => {
      process.env.PREFIX_GITHUB_REPO = "test-repo";

      expect(() => PecansGitHubBackend.getEnvironment("PREFIX")).toThrow(
        "PREFIX_GITHUB_OWNER environment variable is required.",
      );
    });

    it("should warn with prefix if prefixed GITHUB_TOKEN is missing", () => {
      process.env.PREFIX_GITHUB_OWNER = "test-owner";
      process.env.PREFIX_GITHUB_REPO = "test-repo";

      PecansGitHubBackend.getEnvironment("PREFIX");

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "PREFIX_GITHUB_TOKEN environment variable was not provided, if your repo is private you will need to provide a token.",
      );
    });
  });

  describe("FromEnv", () => {
    it("should create backend from environment", () => {
      const env = {
        GITHUB_OWNER: "test-owner",
        GITHUB_REPO: "test-repo",
        GITHUB_TOKEN: "test-token",
      };
      const opts = { proxyAssets: false };

      const backend = PecansGitHubBackend.FromEnv(env, opts);

      expect(backend).toBeInstanceOf(PecansGitHubBackend);
    });

    it("should create backend from environment with default options", () => {
      const env = {
        GITHUB_OWNER: "test-owner",
        GITHUB_REPO: "test-repo",
        GITHUB_TOKEN: "test-token",
      };

      const backend = PecansGitHubBackend.FromEnv(env);

      expect(backend).toBeInstanceOf(PecansGitHubBackend);
    });
  });

  describe("constructor", () => {
    it("should create backend with all parameters", () => {
      backend = new PecansGitHubBackend("owner", "repo", "token", {
        baseUrl: "https://api.github.com",
        proxyAssets: false,
      });

      expect(backend).toBeInstanceOf(PecansGitHubBackend);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("should create backend without token and warn", () => {
      backend = new PecansGitHubBackend("owner", "repo");

      expect(backend).toBeInstanceOf(PecansGitHubBackend);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Github Token not provided, ensure the repo is public",
      );
    });

    it("should throw error if owner is missing", () => {
      expect(() => new PecansGitHubBackend("", "repo", "token")).toThrow(
        "Github Owner Required",
      );
    });

    it("should throw error if repo is missing", () => {
      expect(() => new PecansGitHubBackend("owner", "", "token")).toThrow(
        "Github Repo Required",
      );
    });

    it("should create backend with empty token", () => {
      backend = new PecansGitHubBackend("owner", "repo", "");

      expect(backend).toBeInstanceOf(PecansGitHubBackend);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Github Token not provided, ensure the repo is public",
      );
    });
  });

  describe("PecansGitHubBackendSettings", () => {
    it("should have correct default values", () => {
      const settings = new PecansGitHubBackendSettings();

      expect(settings.baseUrl).toBeUndefined();
      expect(settings.proxyAssets).toBe(true);
      expect(settings.refreshSecret).toBeUndefined();
      expect(settings.cacheMaxAge).toBe(60 * 60 * 2); // 2 hours
    });
  });

  describe("getRefreshWebhookMiddleware", () => {
    beforeEach(() => {
      backend = new PecansGitHubBackend("owner", "repo", "token");
    });

    it("should return no-op middleware when no refresh secret", () => {
      const middleware = backend.getRefreshWebhookMiddleware("/webhook");
      const mockReq = {} as any;
      const mockRes = {} as any;
      const mockNext = vi.fn();

      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it("should create webhook middleware when refresh secret provided", () => {
      backend = new PecansGitHubBackend("owner", "repo", "token", {
        refreshSecret: "webhook-secret",
      });

      const mockMiddleware = vi.fn();
      mockCreateNodeMiddleware.mockReturnValue(mockMiddleware);

      const middleware = backend.getRefreshWebhookMiddleware("/webhook");

      expect(mockCreateNodeMiddleware).toHaveBeenCalledWith(mockWebhooks, {
        path: "/webhook",
      });
      expect(middleware).toBe(mockMiddleware);
    });

    it("should set up webhook listener for release events", () => {
      backend = new PecansGitHubBackend("owner", "repo", "token", {
        refreshSecret: "webhook-secret",
      });

      backend.getRefreshWebhookMiddleware("/webhook");

      expect(mockWebhooks.on).toHaveBeenCalledWith(
        "release",
        expect.any(Function),
      );
    });

    it("should call refreshCache when release webhook event is triggered", async () => {
      backend = new PecansGitHubBackend("owner", "repo", "token", {
        refreshSecret: "test-secret",
      });

      const refreshCacheSpy = vi
        .spyOn(backend, "refreshCache")
        .mockResolvedValue({} as any);

      backend.getRefreshWebhookMiddleware("/webhook");

      // Get the callback that was registered and trigger it
      const releaseCallback = mockWebhooks.on.mock.calls.find(
        (call: any) => call[0] === "release",
      )?.[1];
      expect(releaseCallback).toBeDefined();

      // Trigger the webhook event (this will execute line 145)
      await releaseCallback();

      expect(refreshCacheSpy).toHaveBeenCalledOnce();
    });
  });

  describe("fetchReleases", () => {
    beforeEach(() => {
      backend = new PecansGitHubBackend("test-owner", "test-repo", "token");
    });

    it("should fetch and normalize releases", async () => {
      const mockReleases = [
        {
          id: 1,
          tag_name: "v1.0.0",
          draft: false,
          published_at: "2023-01-01T00:00:00Z",
          body: "Release notes",
          assets: [
            {
              id: 1,
              name: "app-v1.0.0-win32-x64.exe",
              size: 1000,
              content_type: "application/octet-stream",
              url: "https://api.github.com/repos/owner/repo/releases/assets/1",
              browser_download_url:
                "https://github.com/owner/repo/releases/download/v1.0.0/app.exe",
            },
          ],
        },
        {
          id: 2,
          tag_name: "v0.9.0",
          draft: true, // Should be filtered out
          published_at: "2023-01-01T00:00:00Z",
          body: "Draft release",
          assets: [],
        },
      ];

      mockOctokit.paginate.mockResolvedValue(mockReleases);

      const result = await backend.fetchReleases();

      expect(mockOctokit.paginate).toHaveBeenCalledWith(
        mockOctokit.rest.repos.listReleases,
        { owner: "test-owner", repo: "test-repo" },
      );
      expect(result.getReleases()).toHaveLength(1);
    });

    it("should handle releases without published_at", async () => {
      const mockReleases = [
        {
          id: 1,
          tag_name: "v1.0.0",
          draft: false,
          published_at: null,
          body: null,
          assets: [],
        },
      ];

      mockOctokit.paginate.mockResolvedValue(mockReleases);

      const result = await backend.fetchReleases();

      expect(result.getReleases()).toHaveLength(1);
    });
  });

  describe("serveAsset", () => {
    let mockResponse: Partial<Response>;

    beforeEach(() => {
      backend = new PecansGitHubBackend("owner", "repo", "token");
      mockResponse = {
        redirect: vi.fn(),
      };
    });

    it("should redirect to the raw payload's browser_download_url when not proxying", async () => {
      backend = new PecansGitHubBackend("owner", "repo", "token", {
        proxyAssets: false,
      });

      const asset = {
        id: "1",
        type: "windows_64" as const,
        filename: "app.exe",
        size: 1000,
        content_type: "application/octet-stream",
        raw: {
          browser_download_url:
            "https://github.com/owner/repo/releases/download/v1.0.0/app.exe",
        } as GithubReleaseAsset,
      };

      await backend.serveAsset(asset, mockResponse as Response);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        asset.raw.browser_download_url,
      );
    });

    it("should throw a clear error when the raw payload has no download url", async () => {
      backend = new PecansGitHubBackend("owner", "repo", "token", {
        proxyAssets: false,
      });

      const asset = {
        id: "1",
        type: "windows_64" as const,
        filename: "app.exe",
        size: 1000,
        content_type: "application/octet-stream",
        raw: {} as GithubReleaseAsset,
      };

      await expect(
        backend.serveAsset(asset, mockResponse as Response),
      ).rejects.toThrow("no browser_download_url");
    });

    it("should fetch and redirect to location when proxying", async () => {
      backend = new PecansGitHubBackend("owner", "repo", "token", {
        proxyAssets: true,
      });

      const asset = {
        id: "1",
        type: "windows_64" as const,
        filename: "app.exe",
        size: 1000,
        content_type: "application/octet-stream",
        raw: {
          url: "https://api.github.com/repos/owner/repo/releases/assets/1",
        } as GithubReleaseAsset,
      };

      const mockFetchResponse = {
        headers: {
          get: vi
            .fn()
            .mockReturnValue(
              "https://github-releases.s3.amazonaws.com/temp-url",
            ),
        },
      } as any;
      mockFetch.mockResolvedValue(mockFetchResponse);

      await backend.serveAsset(asset, mockResponse as Response);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/releases/assets/1",
        {
          headers: {
            Accept: "application/octet-stream",
            Authorization: "token token",
          },
          redirect: "manual",
        },
      );
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        "https://github-releases.s3.amazonaws.com/temp-url",
      );
    });

    it("should throw error when location header is missing", async () => {
      backend = new PecansGitHubBackend("owner", "repo", "token", {
        proxyAssets: true,
      });

      const asset = {
        id: "1",
        type: "windows_64" as const,
        filename: "app.exe",
        size: 1000,
        content_type: "application/octet-stream",
        raw: {
          url: "https://api.github.com/repos/owner/repo/releases/assets/1",
        } as GithubReleaseAsset,
      };

      const mockFetchResponse = {
        status: 404,
        headers: {
          get: vi.fn().mockReturnValue(null),
        },
      } as any;
      mockFetch.mockResolvedValue(mockFetchResponse);

      // the error carries the asset id, api url, and status for diagnosis
      await expect(
        backend.serveAsset(asset, mockResponse as Response),
      ).rejects.toThrow(
        "Unable to resolve download location for asset 1 " +
          "(https://api.github.com/repos/owner/repo/releases/assets/1): " +
          "HTTP 404 without a Location header",
      );
    });
  });

  describe("getAssetStream", () => {
    beforeEach(() => {
      backend = new PecansGitHubBackend("owner", "repo", "token");
    });

    it("should fetch asset stream with token", async () => {
      const asset = {
        id: "1",
        type: "windows_64" as const,
        filename: "app.exe",
        size: 1000,
        content_type: "application/octet-stream",
        raw: {
          url: "https://api.github.com/repos/owner/repo/releases/assets/1",
        } as GithubReleaseAsset,
      };

      // native fetch resolves `body` to a web ReadableStream; the backend wraps
      // it as a Node Readable so downstream stream.pipeline() keeps working.
      const mockBody = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("payload"));
          controller.close();
        },
      });
      const mockFetchResponse = { body: mockBody } as any;
      mockFetch.mockResolvedValue(mockFetchResponse);

      const result = await backend.getAssetStream(asset);

      expect(mockFetch).toHaveBeenCalledWith(asset.raw.url, {
        method: "get",
        headers: {
          "User-Agent": "pecans",
          Accept: "application/octet-stream",
          Authorization: "token token",
        },
      });
      expect(result).toBeInstanceOf(Readable);
      const chunks: Buffer[] = [];
      for await (const chunk of result as Readable) {
        chunks.push(Buffer.from(chunk));
      }
      expect(Buffer.concat(chunks).toString()).toBe("payload");
    });

    it("should fetch asset stream without token", async () => {
      backend = new PecansGitHubBackend("owner", "repo");

      const asset = {
        id: "1",
        type: "windows_64" as const,
        filename: "app.exe",
        size: 1000,
        content_type: "application/octet-stream",
        raw: {
          url: "https://api.github.com/repos/owner/repo/releases/assets/1",
        } as GithubReleaseAsset,
      };

      const mockBody = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.close();
        },
      });
      const mockFetchResponse = { body: mockBody } as any;
      mockFetch.mockResolvedValue(mockFetchResponse);

      await backend.getAssetStream(asset);

      expect(mockFetch).toHaveBeenCalledWith(asset.raw.url, {
        method: "get",
        headers: {
          "User-Agent": "pecans",
          Accept: "application/octet-stream",
        },
      });
    });
  });

  describe("normalizeRelease", () => {
    beforeEach(() => {
      backend = new PecansGitHubBackend("owner", "repo", "token");
    });

    it("should normalize a complete release", () => {
      const githubRelease = {
        id: 1,
        tag_name: "v1.0.0",
        published_at: "2023-01-01T00:00:00Z",
        body: "Release notes",
        assets: [
          {
            id: 1,
            name: "app-v1.0.0-win32-x64.exe",
            size: 1000,
            content_type: "application/octet-stream",
            url: "https://api.github.com/repos/owner/repo/releases/assets/1",
          },
        ],
      };

      const result = backend.normalizeRelease(githubRelease as any);

      expect(result.version).toBe("1.0.0");
      expect(result.channel).toBe("stable");
      expect(result.notes).toBe("Release notes");
      expect(result.published_at).toEqual(new Date("2023-01-01T00:00:00Z"));
    });

    it("should handle release with loose semver tag", () => {
      const githubRelease = {
        id: 1,
        tag_name: "release-1.0.0-beta",
        published_at: "2023-01-01T00:00:00Z",
        body: "Beta release",
        assets: [],
      };

      const result = backend.normalizeRelease(githubRelease as any);

      expect(result.version).toBe("release-1.0.0-beta");
    });

    it("should handle release with invalid semver tag", () => {
      const githubRelease = {
        id: 1,
        tag_name: "not-a-semver",
        published_at: "2023-01-01T00:00:00Z",
        body: "Invalid semver",
        assets: [],
      };

      const result = backend.normalizeRelease(githubRelease as any);

      expect(result.version).toBe("not-a-semver");
    });

    it("should handle release with null body and published_at", () => {
      const githubRelease = {
        id: 1,
        tag_name: "v1.0.0",
        published_at: null,
        body: null,
        assets: [],
      };

      const result = backend.normalizeRelease(githubRelease as any);

      expect(result.notes).toBe("");
      expect(result.published_at).toEqual(new Date(99999, 12, 31));
    });

    it("should filter out assets with invalid platforms", () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const githubRelease = {
        id: 1,
        tag_name: "v1.0.0",
        published_at: "2023-01-01T00:00:00Z",
        body: "Release",
        assets: [
          {
            id: 1,
            name: "invalid-platform-name.txt", // This will throw when getting platform
            size: 1000,
            content_type: "text/plain",
          },
        ],
      };

      const result = backend.normalizeRelease(githubRelease as any);

      expect(result.assets).toHaveLength(0);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("should keep msix assets alongside exe assets", () => {
      const githubRelease = {
        id: 1,
        tag_name: "v5.0.13",
        published_at: "2026-05-22T00:00:00Z",
        body: "MSIX release",
        assets: [
          {
            id: 1,
            name: "Visibox-Setup-5.0.13.exe",
            size: 1000,
            content_type: "application/octet-stream",
          },
          {
            id: 2,
            name: "Visibox_5.0.13.0_x64.msix",
            size: 1000,
            content_type: "application/octet-stream",
          },
          {
            id: 3,
            name: "Visibox-5.0.13.msixbundle",
            size: 1000,
            content_type: "application/octet-stream",
          },
        ],
      };

      const result = backend.normalizeRelease(githubRelease as any);

      expect(result.assets).toHaveLength(3);
      expect(result.assets.map((a) => a.type)).toEqual([
        "windows_64",
        "windows_msix_64",
        "windows_msix_universal",
      ]);
      expect(result.assets[1].pkg).toBe("msix");
      expect(result.assets[2].arch).toBe("universal");
    });

    it("should filter out assets that fail to normalize", () => {
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      // Mock normalizeAsset to throw for certain assets
      const originalNormalizeAsset = backend.normalizeAsset;
      vi.spyOn(backend, "normalizeAsset").mockImplementation((asset) => {
        if (asset.name === "failing-asset.exe") {
          throw new Error("Failed to normalize");
        }
        return originalNormalizeAsset.call(backend, asset);
      });

      const githubRelease = {
        id: 1,
        tag_name: "v1.0.0",
        published_at: "2023-01-01T00:00:00Z",
        body: "Release",
        assets: [
          {
            id: 1,
            name: "failing-asset.exe",
            size: 1000,
            content_type: "application/octet-stream",
          },
          {
            id: 2,
            name: "good-asset-win32-x64.exe",
            size: 1000,
            content_type: "application/octet-stream",
          },
        ],
      };

      const result = backend.normalizeRelease(githubRelease as any);

      expect(result.assets).toHaveLength(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "failed to normalize asset",
        expect.any(Error),
      );
    });
  });

  describe("normalizeAsset", () => {
    beforeEach(() => {
      backend = new PecansGitHubBackend("owner", "repo", "token");
    });

    it("should normalize a github asset", () => {
      const githubAsset = {
        id: 123,
        name: "app-v1.0.0-win32-x64.exe",
        size: 1000,
        content_type: "application/octet-stream",
        url: "https://api.github.com/repos/owner/repo/releases/assets/123",
        browser_download_url:
          "https://github.com/owner/repo/releases/download/v1.0.0/app-v1.0.0-win32-x64.exe",
      };

      const result = backend.normalizeAsset(githubAsset as any);

      expect(result.id).toBe("123");
      expect(result.filename).toBe("app-v1.0.0-win32-x64.exe");
      expect(result.type).toBe("windows_32");
      expect(result.size).toBe(1000);
      expect(result.content_type).toBe("application/octet-stream");
      // raw carries the full GitHub asset for this backend's later use
      expect(result.raw).toBe(githubAsset);
    });
  });
});

describe("GitHubBackend (deprecated)", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("should create backend and show deprecation warning", () => {
    const backend = new GitHubBackend("token", "owner", "repo");

    expect(backend).toBeInstanceOf(GitHubBackend);
    expect(backend).toBeInstanceOf(PecansGitHubBackend);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "GitHubBackend has been deprecated in favor of the namespaced PecansGithubBackend",
    );
  });

  it("should throw error if token is missing", () => {
    expect(() => new GitHubBackend("", "owner", "repo")).toThrow(
      "Github Token Required",
    );
  });

  it("should throw error if owner is missing", () => {
    expect(() => new GitHubBackend("token", "", "repo")).toThrow(
      "Github Owner Required",
    );
  });

  it("should throw error if repo is missing", () => {
    expect(() => new GitHubBackend("token", "owner", "")).toThrow(
      "Github Repo Required",
    );
  });
});
