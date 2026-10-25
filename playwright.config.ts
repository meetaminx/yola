import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end tests. They run against a production build
 * (`next start`), never the dev server. Dashboard tests need PostgreSQL
 * (E2E_DATABASE_URL, default postgresql://postgres@localhost:5432/yola_e2e);
 * the global setup applies migrations to it.
 *
 * First run: `pnpm exec playwright install chromium`.
 * Set E2E_SKIP_BUILD=1 to reuse an existing `.next` build.
 */
const PORT = Number(process.env.E2E_PORT ?? 3200);
const ORIGIN = `http://localhost:${PORT}`;

/** Server environment for e2e runs: a dedicated database and throwaway secrets. */
const E2E_ENV = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgresql://postgres@localhost:5432/yola_e2e",
  YOLA_SESSION_SECRET: "e2e-session-secret-0123456789abcdef0123456789abcdef",
  YOLA_ENCRYPTION_KEY: "ZTJlLWVuY3J5cHRpb24ta2V5LTAxMjM0NTY3ODlhYmM=",
  YOLA_PUBLIC_APP_URL: ORIGIN,
  YOLA_JOBS_MODE: "inline",
  // Tests act as clients behind a proxy: each browser context sends its own
  // X-Forwarded-For, so Better Auth's per-IP limits apply per test user.
  YOLA_TRUST_PROXY: "true",
  LOG_LEVEL: "warn",
};

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: ORIGIN,
    trace: "retain-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testIgnore: /responsive\.spec\.ts/,
    },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    command: process.env.E2E_SKIP_BUILD ? `pnpm start -p ${PORT}` : `pnpm build && pnpm start -p ${PORT}`,
    url: `${ORIGIN}/api/v1/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: E2E_ENV,
  },
});
