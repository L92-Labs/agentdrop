import { defineConfig } from "vitest/config";

/** Node-side smoke tests against a live deployment (set E2E_BASE_URL). */
export default defineConfig({
  test: {
    globals: true,
    include: ["test/e2e/**/*.test.ts"],
    testTimeout: 60_000,
    environment: "node",
  },
});
