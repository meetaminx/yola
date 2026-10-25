import "server-only";
import { ApiError } from "@/lib/api/errors";
import type { Db } from "./db";

/**
 * Fixed-window rate limiting stored in Postgres, so limits hold across
 * every server instance. One atomic upsert per check.
 */

export interface LimitResult {
  count: number;
  limit: number;
  remaining: number;
  resetAt: Date;
}

export const LIMITS = {
  /** Authenticated API traffic, per API key. */
  apiKey: { limit: 120, windowSeconds: 60 },
  /** Payment request creation, per API key. */
  create: { limit: 60, windowSeconds: 60 },
  /** Failed or missing authentication, per client IP. Slows key guessing. */
  unauthenticated: { limit: 30, windowSeconds: 60 },
  /** Webhook test sends, per project. */
  webhookTest: { limit: 10, windowSeconds: 60 },
} as const;

export async function consume(prisma: Db, key: string, rule: { limit: number; windowSeconds: number }): Promise<LimitResult> {
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "rate_limit_bucket" ("key", "windowStart", "count")
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart") DO UPDATE SET "count" = "rate_limit_bucket"."count" + 1
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 1);
  return { count, limit: rule.limit, remaining: Math.max(0, rule.limit - count), resetAt: new Date(windowStart.getTime() + windowMs) };
}

export function rateLimitHeaders(r: LimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(r.limit),
    "X-RateLimit-Remaining": String(r.remaining),
    "X-RateLimit-Reset": String(Math.ceil(r.resetAt.getTime() / 1000)),
  };
}

export async function enforce(prisma: Db, key: string, rule: { limit: number; windowSeconds: number }, disabled = false) {
  if (disabled) return null;
  const r = await consume(prisma, key, rule);
  if (r.count > rule.limit) {
    const retry = Math.max(1, Math.ceil((r.resetAt.getTime() - Date.now()) / 1000));
    throw new ApiError(429, "rate_limited", `Too many requests. Retry in ${retry} seconds.`, undefined, {
      ...rateLimitHeaders(r),
      "Retry-After": String(retry),
    });
  }
  return r;
}

/** Remove windows older than an hour. Run by the job loop. */
export async function pruneRateLimits(prisma: Db) {
  await prisma.rateLimitBucket.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 60 * 60 * 1000) } } });
}
