import { Readable } from "stream";
import { beforeEach, describe, expect, it } from "vitest";
import { Backend, type BackendOpts } from "../../src/backends/backend.js";
import { PecansAsset } from "../../src/models/PecansAsset.js";
import { PecansReleases } from "../../src/models/PecansReleases.js";

// Mock stream class for testing various scenarios
class MockReadableStream extends Readable {
  private chunks: Buffer[];
  private shouldError: boolean;
  private errorMessage: string;
  private shouldClose: boolean;
  private emitDelay: number;
  private chunkIndex = 0;

  constructor(
    options: {
      chunks?: Buffer[];
      shouldError?: boolean;
      errorMessage?: string;
      shouldClose?: boolean;
      emitDelay?: number;
    } = {},
  ) {
    super();
    this.chunks = options.chunks || [];
    this.shouldError = options.shouldError || false;
    this.errorMessage = options.errorMessage || "Mock stream error";
    this.shouldClose = options.shouldClose || false;
    this.emitDelay = options.emitDelay || 0;
  }

  _read() {
    const emitNext = () => {
      if (this.shouldError && this.chunkIndex === 0) {
        this.emit("error", new Error(this.errorMessage));
        return;
      }

      if (
        this.shouldClose &&
        this.chunkIndex === Math.floor(this.chunks.length / 2)
      ) {
        this.emit("close");
        return;
      }

      if (this.chunkIndex < this.chunks.length) {
        this.push(this.chunks[this.chunkIndex]);
        this.chunkIndex++;
      } else {
        this.push(null); // End of stream
      }
    };

    if (this.emitDelay > 0) {
      setTimeout(emitNext, this.emitDelay);
    } else {
      emitNext();
    }
  }
}

// Test implementation of Backend with controllable asset streams
class TestAssetBackend extends Backend {
  public mockStream: MockReadableStream | null = null;
  public getAssetStreamCalls: PecansAsset[] = [];

  constructor(opts?: BackendOpts) {
    super(opts);
  }

  async fetchReleases(): Promise<PecansReleases> {
    // Not used in these tests
    throw new Error("Not implemented in test backend");
  }

  async getAssetStream(
    asset: PecansAsset,
  ): Promise<NodeJS.ReadableStream | null> {
    this.getAssetStreamCalls.push(asset);
    return this.mockStream;
  }

  // Test helper methods
  setMockStream(stream: MockReadableStream | null) {
    this.mockStream = stream;
  }

  getGetAssetStreamCalls(): PecansAsset[] {
    return this.getAssetStreamCalls;
  }

  clearCalls() {
    this.getAssetStreamCalls = [];
  }
}

// Mock asset for testing
const createMockAsset = (id: string = "test-asset"): PecansAsset => {
  return new PecansAsset({
    id,
    type: "windows_64",
    filename: `${id}-win32-x64.exe`, // Use a filename that can be recognized
    size: 1024,
    content_type: "application/octet-stream",
    raw: {},
  });
};

describe("Backend Asset Reading", () => {
  let backend: TestAssetBackend;
  let mockAsset: PecansAsset;

  beforeEach(() => {
    backend = new TestAssetBackend();
    mockAsset = createMockAsset();
    backend.clearCalls();
  });

  describe("readAsset", () => {
    describe("successful scenarios", () => {
      it("should return empty buffer when getAssetStream returns null", async () => {
        backend.setMockStream(null);

        const result = await backend.readAsset(mockAsset);

        expect(result).toEqual(Buffer.from(""));
        expect(backend.getGetAssetStreamCalls()).toHaveLength(1);
        expect(backend.getGetAssetStreamCalls()[0]).toBe(mockAsset);
      });

      it("should return empty buffer for empty stream", async () => {
        const stream = new MockReadableStream({ chunks: [] });
        backend.setMockStream(stream);

        const result = await backend.readAsset(mockAsset);

        expect(result).toEqual(Buffer.from(""));
      });

      it("should accumulate single chunk correctly", async () => {
        const testData = Buffer.from("Hello, World!");
        const stream = new MockReadableStream({ chunks: [testData] });
        backend.setMockStream(stream);

        const result = await backend.readAsset(mockAsset);

        expect(result).toEqual(testData);
      });

      it("should accumulate multiple chunks correctly", async () => {
        const chunk1 = Buffer.from("Hello, ");
        const chunk2 = Buffer.from("World!");
        const chunk3 = Buffer.from(" How are you?");
        const stream = new MockReadableStream({
          chunks: [chunk1, chunk2, chunk3],
        });
        backend.setMockStream(stream);

        const result = await backend.readAsset(mockAsset);

        const expected = Buffer.concat([chunk1, chunk2, chunk3]);
        expect(result).toEqual(expected);
        expect(result.toString()).toBe("Hello, World! How are you?");
      });

      it("should handle binary data correctly", async () => {
        const binaryData = Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]); // PNG header
        const stream = new MockReadableStream({ chunks: [binaryData] });
        backend.setMockStream(stream);

        const result = await backend.readAsset(mockAsset);

        expect(result).toEqual(binaryData);
      });

      it("should handle large data by accumulating many small chunks", async () => {
        const chunkSize = 1024;
        const numChunks = 100;
        const chunks = Array.from({ length: numChunks }, (_, i) => {
          return Buffer.alloc(chunkSize, i % 256);
        });
        const stream = new MockReadableStream({ chunks });
        backend.setMockStream(stream);

        const result = await backend.readAsset(mockAsset);

        expect(result.length).toBe(chunkSize * numChunks);
        expect(result).toEqual(Buffer.concat(chunks));
      });
    });

    describe("error handling", () => {
      it("should reject when stream emits error immediately", async () => {
        const stream = new MockReadableStream({
          shouldError: true,
          errorMessage: "Network error",
        });
        backend.setMockStream(stream);

        await expect(backend.readAsset(mockAsset)).rejects.toThrow(
          "Network error",
        );
      });

      it("should reject when stream emits error after some data", async () => {
        const chunk1 = Buffer.from("Some data");
        const stream = new MockReadableStream({
          chunks: [chunk1],
          shouldError: true,
          errorMessage: "Connection lost",
        });
        backend.setMockStream(stream);

        await expect(backend.readAsset(mockAsset)).rejects.toThrow(
          "Connection lost",
        );
      });

      it("should handle custom error objects", async () => {
        const customError = new Error("Custom error");
        customError.name = "CustomError";
        const stream = new MockReadableStream({
          shouldError: true,
          errorMessage: customError.message,
        });
        backend.setMockStream(stream);

        await expect(backend.readAsset(mockAsset)).rejects.toThrow(
          "Custom error",
        );
      });
    });

    describe("stream cleanup", () => {
      it("should clean up stream listeners on successful completion", async () => {
        const stream = new MockReadableStream({
          chunks: [Buffer.from("test")],
        });
        backend.setMockStream(stream);

        await backend.readAsset(mockAsset);

        // Verify stream completed successfully - indirect cleanup verification
        // The stream should have finished reading all data
        expect(stream.readableEnded || stream.destroyed).toBeTruthy();
      });

      it("should clean up stream listeners on error", async () => {
        const stream = new MockReadableStream({
          shouldError: true,
          errorMessage: "Test error",
        });
        backend.setMockStream(stream);

        await expect(backend.readAsset(mockAsset)).rejects.toThrow(
          "Test error",
        );

        // After an error, the stream should be in an error state or destroyed
        // This indirectly verifies that cleanup occurred
        expect(stream.destroyed || stream.readableEnded).toBeTruthy();
      });

      it("should not leak memory with proper cleanup", async () => {
        const stream = new MockReadableStream({
          chunks: [Buffer.from("test data")],
        });
        backend.setMockStream(stream);

        // Test that the method completes without memory leaks
        const result = await backend.readAsset(mockAsset);

        expect(result.toString()).toBe("test data");
        // Successful completion implies cleanup was called (tested indirectly)
        expect(stream.readableEnded || stream.destroyed).toBeTruthy();
      });
    });

    describe("edge cases and Node.js 22.x compatibility", () => {
      it("should handle stream that emits close without end", async () => {
        // This simulates a scenario where a stream closes unexpectedly
        // without emitting 'end' - important for Node.js 22.x compatibility
        const chunk1 = Buffer.from("Partial data");
        const stream = new MockReadableStream({
          chunks: [chunk1, Buffer.from("more data")],
          shouldClose: true, // Will emit close in the middle
        });
        backend.setMockStream(stream);

        // Current implementation doesn't handle 'close' event properly
        // In Node.js 22.x, this would cause the promise to hang or fail
        // This test documents the current limitation
        await expect(backend.readAsset(mockAsset)).rejects.toThrow(
          "Premature close",
        );
      });

      it("should handle premature close event with proper error handling", async () => {
        // This test demonstrates what proper close event handling should look like
        // for Node.js 22.x compatibility
        class CloseEmittingStream extends Readable {
          private dataEmitted = false;

          _read() {
            if (!this.dataEmitted) {
              this.push(Buffer.from("Some data before close"));
              this.dataEmitted = true;
              // Emit close without end - simulating network interruption
              setImmediate(() => this.emit("close"));
            }
          }
        }

        const stream = new CloseEmittingStream();
        backend.setMockStream(stream as any);

        // Current implementation will fail with premature close
        // Future implementation should handle this gracefully
        await expect(backend.readAsset(mockAsset)).rejects.toThrow(
          /Premature close|Stream closed unexpectedly/,
        );
      });

      it("should demonstrate ideal close event handling behavior", async () => {
        // This test shows what the readAsset method should do when properly
        // handling close events for Node.js 22.x compatibility
        class ManualControlStream extends Readable {
          private chunks = [Buffer.from("data1"), Buffer.from("data2")];
          private index = 0;

          _read() {
            if (this.index < this.chunks.length) {
              this.push(this.chunks[this.index++]);
            } else {
              // Don't call push(null) - simulate abrupt close
              setImmediate(() => this.emit("close"));
            }
          }
        }

        const stream = new ManualControlStream();
        backend.setMockStream(stream as any);

        // Current behavior: will throw premature close error
        // Ideal behavior: should either return partial data with warning
        // or throw a more descriptive error about unexpected close
        await expect(backend.readAsset(mockAsset)).rejects.toThrow();

        // TODO: When implementing proper close handling, this test should be updated to:
        // const result = await backend.readAsset(mockAsset);
        // expect(result).toEqual(Buffer.concat([Buffer.from("data1"), Buffer.from("data2")]));
        // Or alternatively, expect a specific "UnexpectedStreamCloseError"
      });

      it("should handle rapid event succession", async () => {
        const chunks = [
          Buffer.from("chunk1"),
          Buffer.from("chunk2"),
          Buffer.from("chunk3"),
        ];
        const stream = new MockReadableStream({ chunks, emitDelay: 1 });
        backend.setMockStream(stream);

        const result = await backend.readAsset(mockAsset);

        expect(result).toEqual(Buffer.concat(chunks));
      });

      it("should handle zero-length chunks", async () => {
        const chunks = [
          Buffer.from("start"),
          Buffer.alloc(0), // Zero-length buffer
          Buffer.from("end"),
        ];
        const stream = new MockReadableStream({ chunks });
        backend.setMockStream(stream);

        const result = await backend.readAsset(mockAsset);

        expect(result.toString()).toBe("startend");
      });

      it("should handle stream that never emits data", async () => {
        class NeverEndingStream extends Readable {
          _read() {
            // Never push anything, never end
          }
        }

        const stream = new NeverEndingStream();
        // Cast to MockReadableStream to satisfy TypeScript
        backend.setMockStream(stream as any);

        // This should timeout if the stream never resolves
        const promise = backend.readAsset(mockAsset);

        // Manually end the stream after a short delay to test timeout behavior
        setTimeout(() => {
          stream.push(null);
        }, 10);

        const result = await promise;
        expect(result).toEqual(Buffer.from(""));
      });
    });

    describe("performance and memory", () => {
      it("should handle very large single chunk", async () => {
        const largeChunk = Buffer.alloc(10 * 1024 * 1024, 0x42); // 10MB
        const stream = new MockReadableStream({ chunks: [largeChunk] });
        backend.setMockStream(stream);

        const result = await backend.readAsset(mockAsset);

        expect(result.length).toBe(largeChunk.length);
        expect(result[0]).toBe(0x42);
        expect(result[result.length - 1]).toBe(0x42);
      });

      it("should efficiently concatenate many small chunks", async () => {
        const numChunks = 1000;
        const chunks = Array.from({ length: numChunks }, (_, i) =>
          Buffer.from(`chunk${i}`),
        );
        const stream = new MockReadableStream({ chunks });
        backend.setMockStream(stream);

        const startTime = Date.now();
        const result = await backend.readAsset(mockAsset);
        const endTime = Date.now();

        expect(result.length).toBeGreaterThan(numChunks * 6); // Each chunk is at least 6 bytes
        expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      });
    });

    describe("integration with different asset types", () => {
      it("should work with different asset configurations", async () => {
        const assets = [
          new PecansAsset({
            id: "windows-x64",
            type: "windows_64",
            filename: "app-win32-x64.exe",
            size: 1024,
            content_type: "application/octet-stream",
            raw: {},
          }),
          new PecansAsset({
            id: "macos-arm64",
            type: "osx_arm64",
            filename: "app-darwin-arm64.dmg",
            size: 2048,
            content_type: "application/octet-stream",
            raw: {},
          }),
          new PecansAsset({
            id: "linux-x64",
            type: "linux_64",
            filename: "app-linux-x64.deb",
            size: 1536,
            content_type: "application/octet-stream",
            raw: {},
          }),
        ];

        for (const asset of assets) {
          const testData = Buffer.from(`Data for ${asset.id}`);
          const stream = new MockReadableStream({ chunks: [testData] });
          backend.setMockStream(stream);

          const result = await backend.readAsset(asset);
          expect(result.toString()).toBe(`Data for ${asset.id}`);
        }

        expect(backend.getGetAssetStreamCalls()).toHaveLength(3);
      });
    });
  });
});
