import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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
