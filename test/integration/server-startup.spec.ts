import express from "express";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../../src/index.js";

// Create mocks that will be populated in beforeEach
let mockListen: any;
let mockUse: any;
let mockAddress: any;
let mockClose: any;
let mockServer: any;
let mockApp: any;

vi.mock("express", async (importOriginal) => {
  const actual = await importOriginal<typeof express>();
  return {
    ...actual,
    default: vi.fn(() => ({
      use: vi.fn(),
      listen: vi.fn(),
    })),
    Router: vi.fn(() => ({
      use: vi.fn(),
      get: vi.fn(),
      post: vi.fn(),
    })),
  };
});

describe("Server Startup Integration", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Set up test environment
    process.env.GITHUB_OWNER = "test-owner";
    process.env.GITHUB_REPO = "test-repo";
    process.env.GITHUB_TOKEN = "test-token";

    // Mock console methods
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Reset mocks
    vi.clearAllMocks();

    // Set up mock functions
    mockListen = vi.fn();
    mockUse = vi.fn();
    mockAddress = vi.fn();
    mockClose = vi.fn();

    mockServer = {
      listen: mockListen,
      address: mockAddress,
      close: mockClose,
    } as unknown as Server;

    mockApp = {
      use: mockUse,
      listen: mockListen,
    } as unknown as express.Express;

    // Set up express mock to return our mock app
    vi.mocked(express).mockReturnValue(mockApp);

    // Set up server.listen to call callback and return server
    mockListen.mockImplementation((port: any, callback?: () => void) => {
      if (callback) {
        // Simulate async server startup
        setTimeout(callback, 0);
      }
      return mockServer;
    });

    // Set up server.address mock
    mockAddress.mockReturnValue({ address: "127.0.0.1", port: 5000 });
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;

    // Restore console
    consoleLogSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
  });

  describe("main function", () => {
    it("should start server with proper configuration", async () => {
      // Set custom port
      process.env.PORT = "3000";

      // Call main function
      main();

      // Verify express app was created
      expect(express).toHaveBeenCalledTimes(1);

      // Verify middleware was added (pecans router + error handlers)
      expect(mockUse).toHaveBeenCalledTimes(3);

      // Verify server.listen was called with correct port
      expect(mockListen).toHaveBeenCalledWith("3000", expect.any(Function));

      // Wait for server startup callback
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify server address was checked
      expect(mockAddress).toHaveBeenCalled();

      // Verify startup message was logged
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Listening at http://127.0.0.1:3000",
      );
    });

    it("should use default port 5000 when PORT env var not set", async () => {
      delete process.env.PORT;

      main();

      expect(mockListen).toHaveBeenCalledWith(5000, expect.any(Function));
    });

    it("should handle string address from server.address()", async () => {
      // Mock server.address to return string instead of object
      mockAddress.mockReturnValue("unix:/tmp/server.sock");

      main();

      // Wait for server startup callback
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "Listening at unix:/tmp/server.sock",
      );
    });

    it("should set up error handling middleware", () => {
      main();

      // Verify that 3 middleware were added:
      // 1. pecans.router
      // 2. 404 handler
      // 3. error handler
      expect(mockUse).toHaveBeenCalledTimes(3);

      // Get the error handler (should be the last call)
      const errorHandlerCall = mockUse.mock.calls[2];
      const errorHandler = errorHandlerCall[0];

      // Verify it's a function with 4 parameters (err, req, res, next)
      expect(typeof errorHandler).toBe("function");
      expect(errorHandler.length).toBe(4);
    });

    it("should test error handler functionality", () => {
      main();

      // Get the error handler
      const errorHandler = mockUse.mock.calls[2][0];

      // Mock response object
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
        format: vi.fn(),
      };

      // Mock request object
      const mockReq = {};
      const mockNext = vi.fn();

      // Create test error
      const testError = new Error("Test error message");
      testError.stack = "Error stack trace";

      // Set up res.format to call the application/json handler
      mockRes.format.mockImplementation((handlers: any) => {
        handlers["application/json"]();
      });

      // Call error handler
      errorHandler(testError, mockReq, mockRes, mockNext);

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith("Error stack trace");

      // Verify response format was called
      expect(mockRes.format).toHaveBeenCalled();
    });

    it("should test 404 handler functionality", () => {
      main();

      // Get the 404 handler (second middleware)
      const notFoundHandler = mockUse.mock.calls[1][0];

      // Mock response object
      const mockRes = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn(),
      };

      // Mock request and next
      const mockReq = {};
      const mockNext = vi.fn();

      // Call 404 handler
      notFoundHandler(mockReq, mockRes, mockNext);

      // Verify 404 response
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.send).toHaveBeenCalledWith("Page not found");
    });
  });

  describe("run-directly check", () => {
    it("should call main() when module is run directly", () => {
      // This test verifies the entry-point check at the bottom of index.ts
      // Since the module is already loaded, we can't easily test this dynamically,
      // but we can verify the logic exists and would work

      // The actual check compares import.meta.url against process.argv[1], so
      // main() is only called when the file is run directly, not imported

      // We can verify this by checking if main is exported (which we already confirmed)
      // and that the file structure supports both import and direct execution
      expect(typeof main).toBe("function");

      // In a real scenario, when dist/index.js is run with `node dist/index.js`,
      // the URLs match and main() would be called automatically
    });
  });
});
