import "server-only";
import { after } from "next/server";
import { getEnv } from "./env";
import { errorFields, log } from "./log";
import { runJobsOnce } from "./jobs";

/**
 * In cron mode (serverless hosts such as Vercel) there is no long-running
 * loop, so work created by a request (webhook deliveries, expiry) is
 * processed right after the response is sent. The scheduled cron run is
 * then only a safety net for retries and anything missed. Claiming is
 * SKIP LOCKED, so overlapping runs never double-send.
 */
export function kickJobs() {
  let mode: string;
  try {
    mode = getEnv().YOLA_JOBS_MODE;
  } catch {
    return;
  }
  if (mode !== "cron") return;
  after(async () => {
    try {
      await runJobsOnce({ timeoutMs: 8_000 });
    } catch (err) {
      log.error("jobs.after_failed", errorFields(err));
    }
  });
}
