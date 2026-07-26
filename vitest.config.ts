import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      thresholds: {
        statements: 80,
        branches: 65,
        functions: 85,
        lines: 80,
      },
    },
  },
});
