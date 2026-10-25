/**
 * Runs once when a Next.js server starts. Validates configuration early
 * (so a misconfigured deploy fails loudly in logs) and starts the
 * background job loop when YOLA_JOBS_MODE=inline.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!process.env.DATABASE_URL) {
    console.warn(JSON.stringify({ level: "warn", msg: "yola.backend_disabled", reason: "DATABASE_URL is not set; the API, dashboard and jobs are unavailable. Marketing pages, docs, playground and sample store still work." }));
    return;
  }
  const { getEnv } = await import("./lib/server/env");
  let env;
  try {
    env = getEnv();
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "yola.invalid_environment", detail: err instanceof Error ? err.message : String(err) }));
    return;
  }
  if (env.YOLA_JOBS_MODE === "inline") {
    const { startInlineJobLoop } = await import("./lib/server/jobs");
    startInlineJobLoop();
  }
}
