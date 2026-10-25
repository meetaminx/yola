import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/server/env";
import { jsonResponse } from "@/lib/server/http";
import { runJobsOnce } from "@/lib/server/jobs";

/**
 * For YOLA_JOBS_MODE=cron: an external scheduler (cron, a platform's
 * scheduled function) calls this every minute with
 *   Authorization: Bearer $YOLA_CRON_SECRET
 */
export async function POST(req: Request) {
  const env = getEnv();
  const secret = env.YOLA_CRON_SECRET;
  const given = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return jsonResponse(401, { error: { code: "unauthenticated", message: "Invalid cron secret." } });
  }
  if (env.YOLA_JOBS_MODE === "off") return jsonResponse(409, { error: { code: "invalid_state", message: "Jobs are turned off." } });
  return jsonResponse(200, await runJobsOnce());
}
