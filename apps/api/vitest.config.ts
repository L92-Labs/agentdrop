import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  const migrationsPath = path.join(import.meta.dirname, "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    test: {
      globals: true,
      setupFiles: ["./test/setup.ts"],
      include: ["test/**/*.test.ts"],
      exclude: ["test/e2e/**/*.test.ts"],
      testTimeout: 30_000,
      fileParallelism: false,
      coverage: {
        provider: "istanbul",
        reportsDirectory: "./coverage",
        reporter: ["text", "json-summary"],
        include: ["src/**/*.ts"],
        exclude: [
          "src/lib/ui.ts",
          "src/lib/skill.ts",
          "src/lib/turnstile.ts",
          "src/logger.ts",
        ],
        // Ratchet: set just under current coverage so CI stays honest. Raise, never lower.
        thresholds: {
          lines: 92,
          branches: 76,
          functions: 92,
          statements: 87,
        },
      },
      poolOptions: {
        workers: {
          singleWorker: true,
          isolatedStorage: false,
          wrangler: { configPath: "./wrangler.jsonc", environment: "test" },
          miniflare: {
            bindings: { TEST_MIGRATIONS: migrations },
          },
        },
      },
    },
  };
});
