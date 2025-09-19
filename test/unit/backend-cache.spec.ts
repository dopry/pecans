import should from "should";
import { Backend, BackendOpts } from "../../src/backends/backend";
import { PecansReleases } from "../../src/models/PecansReleases";
import {
  PecansRelease,
  PecansReleaseDTO,
} from "../../src/models/PecansRelease";
import { PecansAssetDTO } from "../../src/models/PecansAsset";

// Test implementation of Backend with controllable behavior
class TestBackend extends Backend {
  public fetchCount = 0;
  public shouldFailFetch = false;
  public fetchDelay = 0;
  public mockReleases: PecansReleases;

  constructor(opts?: BackendOpts) {
    super(opts);
    // Create mock data for testing
    const mockAssetDTO: PecansAssetDTO = {
      id: "test-asset-1",
      type: "windows_64",
      filename: "test-app-1.0.0-win32-x64.zip",
      size: 12345,
      content_type: "application/zip",
      raw: {},
    };

    const mockReleaseDTO: PecansReleaseDTO = {
      version: "v1.0.0",
      channel: "stable",
      published_at: new Date("2025-01-01T00:00:00Z"),
      notes: "Test release",
      assets: [mockAssetDTO],
    };

    const mockRelease = new PecansRelease(mockReleaseDTO);
    this.mockReleases = new PecansReleases([mockRelease]);
  }

  async fetchReleases(): Promise<PecansReleases> {
    this.fetchCount++;

    if (this.shouldFailFetch) {
      throw new Error("Mock fetch error");
    }

    if (this.fetchDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.fetchDelay));
    }

    return this.mockReleases;
  }

  // Expose protected members for testing
  public getCache(): PecansReleases | null {
    return this.cache;
  }

  public getCacheTimestamp(): number {
    return this.cacheTimestamp;
  }

  public getCacheRefreshPromise(): Promise<PecansReleases> | undefined {
    return this.cacheRefreshPromise;
  }

  // Reset state for clean tests
  public resetState(): void {
    this.cache = null;
    this.cacheTimestamp = 0;
    this.cacheRefreshPromise = undefined;
    this.fetchCount = 0;
    this.shouldFailFetch = false;
    this.fetchDelay = 0;
  }
}

describe("Backend Caching", () => {
  let backend: TestBackend;
  let originalDateNow: () => number;
  let currentTime: number;

  beforeEach(() => {
    // Mock Date.now for consistent time-based testing
    currentTime = 1000000000000; // Fixed start time
    originalDateNow = Date.now;
    Date.now = () => currentTime;
    backend = new TestBackend();
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  function advanceTime(ms: number) {
    currentTime += ms;
  }

  describe("Cache Initialization", () => {
    it("should have empty cache state on initialization", () => {
      should(backend.getCache()).be.null();
      backend.getCacheTimestamp().should.equal(0);
      should(backend.getCacheRefreshPromise()).be.undefined();
      backend.fetchCount.should.equal(0);
    });
  });

  describe("Initial Cache Population", () => {
    it("should fetch data and populate cache on first call", async () => {
      const startTime = Date.now();

      const releases = await backend.releases();

      releases.should.be.instanceOf(PecansReleases);
      backend.fetchCount.should.equal(1);
      should(backend.getCache()).equal(releases);
      backend.getCacheTimestamp().should.equal(startTime);
      should(backend.getCacheRefreshPromise()).be.undefined();
    });

    it("should return the same data from cache and fetchReleases", async () => {
      const releases = await backend.releases();
      const directFetch = await backend.fetchReleases();

      releases.getReleases().should.deepEqual(directFetch.getReleases());
    });
  });

  describe("Cache Hit Scenarios", () => {
    it("should return cached data without fetching when cache is valid", async () => {
      // First call to populate cache
      const firstReleases = await backend.releases();
      backend.fetchCount.should.equal(1);

      // Advance time but stay within cache max age (2 hours = 7200000 ms)
      advanceTime(3600000); // 1 hour

      // Second call should use cache
      const secondReleases = await backend.releases();
      backend.fetchCount.should.equal(1); // Should not increment
      secondReleases.should.equal(firstReleases); // Should be same object reference
    });

    it("should serve cached data for multiple concurrent requests", async () => {
      const promises = [
        backend.releases(),
        backend.releases(),
        backend.releases(),
      ];

      const results = await Promise.all(promises);

      backend.fetchCount.should.equal(1); // Only one fetch
      results[0].should.equal(results[1]);
      results[1].should.equal(results[2]);
    });
  });

  describe("Cache Expiration", () => {
    it("should fetch new data when cache expires", async () => {
      // First call to populate cache
      await backend.releases();
      backend.fetchCount.should.equal(1);

      // Advance time beyond cache max age (2 hours + 1 second)
      advanceTime(7200000 + 1000);

      // Second call should trigger new fetch
      await backend.releases();
      backend.fetchCount.should.equal(2);
    });

    it("should update cache timestamp after expiration fetch", async () => {
      const startTime = Date.now();

      // First call
      await backend.releases();
      backend.getCacheTimestamp().should.equal(startTime);

      // Advance time and make expired call
      advanceTime(7200000 + 1000);
      const expiredCallTime = Date.now();

      await backend.releases();
      backend.getCacheTimestamp().should.equal(expiredCallTime);
    });
  });

  describe("Concurrent Cache Refresh", () => {
    it("should deduplicate concurrent requests during cache refresh", async () => {
      backend.fetchDelay = 100; // Add delay to fetchReleases

      // Start multiple concurrent requests
      const promises = [
        backend.releases(),
        backend.releases(),
        backend.releases(),
      ];

      // Advance time to resolve the delay
      advanceTime(100);

      const results = await Promise.all(promises);

      backend.fetchCount.should.equal(1); // Only one fetch despite 3 calls
      results[0].should.equal(results[1]);
      results[1].should.equal(results[2]);
    });

    it("should deduplicate requests even when cache is expired", async () => {
      // Populate initial cache
      await backend.releases();

      // Expire cache and add fetch delay
      advanceTime(7200000 + 1000);
      backend.fetchDelay = 100;

      // Start concurrent requests on expired cache
      const promises = [backend.releases(), backend.releases()];

      advanceTime(100);
      await Promise.all(promises);

      backend.fetchCount.should.equal(2); // Initial + one refresh
    });
  });

  describe("Cache Refresh Error Handling", () => {
    it("should preserve existing cache when refresh fails", async () => {
      // Populate initial cache
      const originalReleases = await backend.releases();

      // Expire cache and make fetch fail
      advanceTime(7200000 + 1000);
      backend.shouldFailFetch = true;

      // Should return stale cache when refresh fails, not throw error
      const releases = await backend.releases();

      // Cache should still contain original data (stale but valid)
      releases.should.equal(originalReleases);
      should(backend.getCache()).equal(originalReleases);

      // Wait a tick for the promise to be cleared
      await new Promise((resolve) => setTimeout(resolve, 0));
      should(backend.getCacheRefreshPromise()).be.undefined();
    });

    it("should allow retry after failed refresh", async () => {
      // Populate initial cache
      await backend.releases();

      // Expire cache and fail first refresh attempt
      advanceTime(7200000 + 1000);
      backend.shouldFailFetch = true;

      // First call should return stale cache (not throw error)
      const staleReleases = await backend.releases();
      staleReleases.should.be.instanceOf(PecansReleases);

      // Wait for the failed refresh promise to clear
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Reset failure and try again - should trigger new fetch since cache is still expired
      advanceTime(1000); // Move time forward a bit more
      backend.shouldFailFetch = false;
      const releases = await backend.releases();

      releases.should.be.instanceOf(PecansReleases);
      backend.fetchCount.should.equal(3); // Initial + failed attempt + successful retry
    });

    it("should serve stale cache when no cache exists and fetch fails", async () => {
      backend.shouldFailFetch = true;

      try {
        await backend.releases();
        throw new Error("Expected error to be thrown");
      } catch (error: any) {
        error.message.should.equal("Mock fetch error");
      }

      should(backend.getCache()).be.null();
    });
  });

  describe("Manual Cache Refresh", () => {
    it("should refresh cache immediately when refreshCache is called", async () => {
      // Populate initial cache
      const originalReleases = await backend.releases();
      const originalTimestamp = backend.getCacheTimestamp();

      // Advance time slightly (but not enough to expire)
      advanceTime(1000);

      // Manual refresh
      const refreshedReleases = await backend.refreshCache();

      backend.fetchCount.should.equal(2); // Initial + manual refresh
      backend.getCacheTimestamp().should.be.greaterThan(originalTimestamp);
      refreshedReleases.should.be.instanceOf(PecansReleases);
      should(backend.getCacheRefreshPromise()).be.undefined();
    });

    it("should handle refresh failure and reset promise", async () => {
      await backend.releases(); // Populate cache

      backend.shouldFailFetch = true;

      try {
        await backend.refreshCache();
        throw new Error("Expected error to be thrown");
      } catch (error: any) {
        error.message.should.equal("Mock fetch error");
      }

      should(backend.getCacheRefreshPromise()).be.undefined();
    });
  });

  describe("Configurable Cache Max Age", () => {
    it("should respect custom cache max age setting", async () => {
      // Create backend with 1 second cache max age
      const shortCacheBackend = new TestBackend({ cacheMaxAge: 1 });

      // Populate cache
      await shortCacheBackend.releases();
      shortCacheBackend.fetchCount.should.equal(1);

      // Advance time by 2 seconds (beyond 1 second max age)
      advanceTime(2000);

      // Should trigger new fetch
      await shortCacheBackend.releases();
      shortCacheBackend.fetchCount.should.equal(2);
    });

    it("should use default cache max age when not specified", async () => {
      // Populate cache
      await backend.releases();
      backend.fetchCount.should.equal(1);

      // Advance time by default max age minus 1 second
      advanceTime(7200000 - 1000);

      // Should still use cache
      await backend.releases();
      backend.fetchCount.should.equal(1);

      // Advance past default max age
      advanceTime(2000);

      // Should trigger new fetch
      await backend.releases();
      backend.fetchCount.should.equal(2);
    });
  });

  describe("Stale-While-Revalidate Behavior", () => {
    it("should serve stale cache while refresh is in progress", async () => {
      // Populate initial cache
      const originalReleases = await backend.releases();

      // Expire cache and add delay to refresh
      advanceTime(7200000 + 1000);
      backend.fetchDelay = 1000;

      // Start refresh that will take time
      const refreshPromise = backend.releases();

      // Before refresh completes, another call should get stale cache
      const staleReleases = await backend.releases();

      staleReleases.should.equal(originalReleases); // Same object reference

      // Complete the refresh
      advanceTime(1000);
      const freshReleases = await refreshPromise;

      freshReleases.should.be.instanceOf(PecansReleases);
      backend.fetchCount.should.equal(2);
    });

    it("should update cache after background refresh completes", async () => {
      // Populate initial cache
      await backend.releases();
      const originalTimestamp = backend.getCacheTimestamp();

      // Expire cache and add delay
      advanceTime(7200000 + 1000);
      backend.fetchDelay = 500;

      // Manually trigger refresh (this actually waits for completion)
      await backend.refreshCache();

      // Cache should be updated and refresh promise should be cleared
      const finalTimestamp = backend.getCacheTimestamp();
      finalTimestamp.should.be.greaterThanOrEqual(originalTimestamp);
      should(backend.getCacheRefreshPromise()).be.undefined();
    });
  });
});
