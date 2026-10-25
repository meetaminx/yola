import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/server/auth";
import { sha256Hex } from "@/lib/server/crypto";
import { db } from "@/lib/server/db";
import { getEnv } from "@/lib/server/env";
import { consume } from "@/lib/server/rate-limit";

/**
 * Better Auth's endpoints (sign-up, sign-in, sign-out, session, OAuth).
 *
 * In front of Better Auth's own IP-based limiter, Yola adds limits that do
 * not depend on a client IP (which is forgeable unless a trusted proxy sets
 * it): per-account sign-in attempts and a global sign-up rate.
 */
const SIGN_IN = { limit: 10, windowSeconds: 15 * 60 };
const SIGN_UP = { limit: 30, windowSeconds: 60 };

function tooMany(retryAfter: number) {
  return Response.json(
    { code: "TOO_MANY_REQUESTS", message: "Too many attempts. Wait a few minutes and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" } },
  );
}

async function guard(req: Request): Promise<Response | null> {
  if (getEnv().YOLA_DISABLE_RATE_LIMIT) return null;
  const path = new URL(req.url).pathname;
  if (path.endsWith("/sign-in/email")) {
    const body = (await req.clone().json().catch(() => null)) as { email?: unknown } | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email) {
      const r = await consume(db(), `signin:${sha256Hex(email)}`, SIGN_IN);
      if (r.count > SIGN_IN.limit) return tooMany(Math.ceil((r.resetAt.getTime() - Date.now()) / 1000));
    }
  }
  if (path.endsWith("/sign-up/email")) {
    const r = await consume(db(), "signup:global", SIGN_UP);
    if (r.count > SIGN_UP.limit) return tooMany(Math.ceil((r.resetAt.getTime() - Date.now()) / 1000));
  }
  return null;
}

export async function GET(req: Request) {
  return toNextJsHandler(auth()).GET(req);
}

export async function POST(req: Request) {
  return (await guard(req)) ?? toNextJsHandler(auth()).POST(req);
}
