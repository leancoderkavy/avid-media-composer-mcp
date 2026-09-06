import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Keep process-heavy suites bounded on high-core development machines.
    maxWorkers: 4,
    // Hosted Windows filesystem operations have exceeded the 5s default in
    // independent checkpoint and visual-summary tests. Keep a bounded CI budget.
    testTimeout: process.env.CI && process.platform === "win32" ? 15000 : 5000,
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 90,
        branches: 79,
        functions: 95,
        lines: 92,
      },
    },
  },
});
