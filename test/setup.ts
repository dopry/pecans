/**
 * Test setup file for Vitest
 * Handles global test configuration and error handling
 */

// Track original unhandled rejection handler
const originalUnhandledRejection = process.listeners("unhandledRejection");

// Add handler for expected unhandled rejections during tests
process.on("unhandledRejection", (reason: any, promise: Promise<any>) => {
  // Check if this is an expected "Mock fetch error" from cache refresh tests
  if (reason instanceof Error && reason.message === "Mock fetch error") {
    // Suppress these expected errors during cache refresh error testing
    return;
  }

  // For other unhandled rejections, call the original handlers or log
  if (originalUnhandledRejection.length > 0) {
    originalUnhandledRejection.forEach((handler) => {
      (handler as any)(reason, promise);
    });
  } else {
    console.error("Unhandled Promise Rejection:", reason);
  }
});

// Clean up after tests
export function teardown() {
  // Remove our custom handler and restore original behavior
  process.removeAllListeners("unhandledRejection");
  originalUnhandledRejection.forEach((handler) => {
    process.on("unhandledRejection", handler as any);
  });
}
