import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Keep process-heavy suites bounded on high-core development machines.
    maxWorkers: 4,
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
