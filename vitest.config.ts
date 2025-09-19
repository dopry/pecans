import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Include test files
    include: ["test/**/*.{test,spec}.ts"],

    // Environment
    environment: "node",

    // TypeScript configuration
    typecheck: {
      tsconfig: "./tsconfig.test.json",
    },

    // Test output
    reporter: ["verbose"],

    // Coverage (optional)
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "test/",
        "**/*.d.ts",
        "**/*.config.{js,ts}",
        "**/*.test.{js,ts}",
        "**/*.spec.{js,ts}",
      ],
    },

    // Global test timeout
    testTimeout: 10000,

    // Setup files for global test configuration
    setupFiles: ["./test/setup.ts"],
  },

  // Resolve configuration for TypeScript
  resolve: {
    alias: {
      "@": "./src",
    },
  },
});
