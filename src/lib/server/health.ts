import "server-only";
import { db } from "./db";
import { EnvError, getEnv } from "./env";
import { errorFields, log } from "./log";
import { jobLoopState } from "./jobs";
import { testnetHealth } from "./testnet";

export interface HealthReport {
  status: "ok" | "degraded" | "unavailable";
  time: string;
  checks: {
    configuration: "ok" | "invalid";
    database: "ok" | "unreachable" | "skipped";
    jobs: { mode: string; last_run_at: string | null };
    networks: { demo: "available"; testnet: "available" | "disabled" | "unreachable" | "not_configured"; mainnet: "disabled" };
  };
}

export async function healthReport(): Promise<HealthReport> {
  const time = new Date().toISOString();
  let env;
  try {
    env = getEnv();
  } catch (err) {
    if (!(err instanceof EnvError)) throw err;
    log.error("health.invalid_configuration", errorFields(err));
    return {
      status: "unavailable",
      time,
      checks: {
        configuration: "invalid",
        database: "skipped",
        jobs: { mode: "off", last_run_at: null },
        networks: { demo: "available", testnet: "not_configured", mainnet: "disabled" },
      },
    };
  }

  let database: "ok" | "unreachable" = "ok";
  try {
    await db().$queryRaw`SELECT 1`;
  } catch (err) {
    database = "unreachable";
    log.error("health.database_unreachable", errorFields(err));
  }

  const testnet = env.YOLA_TESTNET_ENABLED ? await testnetHealth() : "disabled";
  const jobs = jobLoopState();
  return {
    status: database === "ok" ? (testnet === "unreachable" ? "degraded" : "ok") : "unavailable",
    time,
    checks: {
      configuration: "ok",
      database,
      jobs: { mode: env.YOLA_JOBS_MODE, last_run_at: jobs.lastRunAt },
      networks: { demo: "available", testnet, mainnet: "disabled" },
    },
  };
}
