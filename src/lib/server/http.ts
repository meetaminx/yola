import "server-only";
import { kickJobs } from "./kick";
import { ApiError } from "@/lib/api/errors";
import { prefixedId } from "@/lib/utils/ids";
import { authenticateApiKey, type ApiKeyContext } from "./api-keys";
import { db, type Db } from "./db";
import { EnvError, getEnv } from "./env";
import { errorFields, log } from "./log";
import { enforce, LIMITS, rateLimitHeaders, type LimitResult } from "./rate-limit";

export const MAX_BODY_BYTES = 32 * 1024;

/** Headers on every API response. Payment data must never be cached by browsers or proxies. */
const BASE_HEADERS: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...headers } });
}

export function clientIp(req: Request): string {
  try {
    if (getEnv().YOLA_TRUST_PROXY) {
      // The right-most entry was added by your proxy; entries to its left came
      // from the client and can be forged.
      const fwd = req.headers.get("x-forwarded-for");
      if (fwd) return fwd.split(",").map((s) => s.trim()).filter(Boolean).at(-1) ?? "untrusted";
    }
  } catch {
    // fall through
  }
  return "untrusted";
}

/** Read a JSON body with size and content-type limits. Empty bodies are undefined. */
export async function readJson(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) throw tooLarge();
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) throw tooLarge();
  if (text.trim() === "") return undefined;
  const type = req.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) {
    throw new ApiError(415, "unsupported_media_type", "Send JSON with Content-Type: application/json.");
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new ApiError(400, "invalid_json", `The body is not valid JSON: ${err instanceof Error ? err.message : "parse error"}.`);
  }
}

function tooLarge() {
  return new ApiError(413, "payload_too_large", `Request bodies are limited to ${MAX_BODY_BYTES / 1024} KB.`);
}

export interface V1Context {
  requestId: string;
  auth: ApiKeyContext;
  prisma: Db;
}

export interface V1Result {
  status: number;
  body: unknown;
  replayed?: boolean;
  headers?: Record<string, string>;
}

/**
 * Wrap an authenticated /api/v1 handler: request ID, API-key auth,
 * per-key and per-IP rate limits, structured errors and request logging.
 */
export function v1(handler: (req: Request, ctx: V1Context) => Promise<V1Result>, opts: { limit?: keyof typeof LIMITS } = {}) {
  return async function route(req: Request): Promise<Response> {
    const requestId = prefixedId("req", 16);
    const started = Date.now();
    const path = new URL(req.url).pathname;
    let status = 500;
    let auth: ApiKeyContext | undefined;
    try {
      const env = getEnv();
      const prisma = db();
      try {
        auth = await authenticateApiKey(prisma, req.headers.get("authorization"));
      } catch (err) {
        await enforce(prisma, `ip:${clientIp(req)}:unauth`, LIMITS.unauthenticated, env.YOLA_DISABLE_RATE_LIMIT);
        throw err;
      }
      let limit: LimitResult | null = await enforce(prisma, `key:${auth.apiKeyId}`, LIMITS.apiKey, env.YOLA_DISABLE_RATE_LIMIT);
      if (opts.limit && opts.limit !== "apiKey") {
        limit = (await enforce(prisma, `key:${auth.apiKeyId}:${opts.limit}`, LIMITS[opts.limit], env.YOLA_DISABLE_RATE_LIMIT)) ?? limit;
      }
      const result = await handler(req, { requestId, auth, prisma });
      status = result.status;
      if (req.method !== "GET" && result.status < 400) kickJobs();
      return jsonResponse(result.status, result.body, {
        "X-Request-Id": requestId,
        ...(limit ? rateLimitHeaders(limit) : {}),
        ...(result.replayed ? { "Idempotent-Replayed": "true" } : {}),
        ...result.headers,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        status = err.status;
        return jsonResponse(err.status, err.toBody(requestId), { "X-Request-Id": requestId, ...err.headers });
      }
      status = err instanceof EnvError ? 503 : 500;
      log.error("api.unhandled_error", { request_id: requestId, path, ...errorFields(err) });
      const e = new ApiError(
        status,
        "internal_error",
        status === 503 ? "The server is not fully configured. The operator has been told." : "Something went wrong on our side. Retry, and quote the request ID if it keeps happening.",
      );
      return jsonResponse(status, e.toBody(requestId), { "X-Request-Id": requestId });
    } finally {
      log.info("api.request", {
        request_id: requestId,
        method: req.method,
        path,
        status,
        duration_ms: Date.now() - started,
        project_id: auth?.projectId,
        api_key_id: auth?.apiKeyId,
      });
    }
  };
}
