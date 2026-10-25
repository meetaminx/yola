import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Integration tests: real route handlers against a real PostgreSQL
 * database (TEST_DATABASE_URL, default postgresql://postgres@localhost:5432/yola_test).
 * The global setup applies migrations; each test file truncates tables.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: "server-only", replacement: r("./tests/support/server-only.ts") },
      { find: "@yola/sdk/react", replacement: r("./src/sdk/react/index.ts") },
      { find: "@yola/sdk", replacement: r("./src/sdk/index.ts") },
      { find: "@", replacement: r("./src") },
    ],
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5432/yola_test",
      YOLA_SESSION_SECRET: "test-session-secret-0123456789abcdef0123456789",
      YOLA_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      YOLA_PUBLIC_APP_URL: "http://localhost:3000",
      YOLA_JOBS_MODE: "off",
      YOLA_WEBHOOK_ALLOW_PRIVATE_NETWORKS: "true",
      LOG_LEVEL: "error",
    },
  },
});
