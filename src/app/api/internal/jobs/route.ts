import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/server/env";
import { jsonResponse } from "@/lib/server/http";
import { runJobsOnce } from "@/lib/server/jobs";

/**
 * Scheduled job runs for YOLA_JOBS_MODE=cron.
 *
 * - Vercel Cron calls GET with "Authorization: Bearer $CRON_SECRET".
 * - Any other scheduler can POST with "Authorization: Bearer $YOLA_CRON_SECRET".
 *
 * Runs are idempotent and claims use SKIP LOCKED, so duplicate or
 * overlapping invocations are harmless.
 */
export const maxDuration = 60;

function authorised(req: Request): boolean {
  const env = getEnv();
  const given = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  return [env.YOLA_CRON_SECRET, env.CRON_SECRET].some(
    (secret) => !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret)),
  );
}

async function run(req: Request) {
  if (!authorised(req)) return jsonResponse(401, { error: { code: "unauthenticated", message: "Invalid cron secret." } });
  if (getEnv().YOLA_JOBS_MODE === "off") return jsonResponse(409, { error: { code: "invalid_state", message: "Jobs are turned off." } });
  return jsonResponse(200, await runJobsOnce({ forceScan: true }));
}

export const GET = run;
export const POST = run;
