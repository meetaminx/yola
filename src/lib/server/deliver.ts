import "server-only";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { signPayload, SIGNATURE_HEADER } from "@/lib/webhooks/signature";
import { resolveSafeTarget, UnsafeUrlError, type UrlPolicy } from "./ssrf";

/**
 * One webhook HTTP attempt. Connects to the pre-validated IP (DNS pinning),
 * never follows redirects, caps time and response size, and reports the
 * outcome only after the attempt has finished.
 */

export interface AttemptResult {
  ok: boolean;
  statusCode: number | null;
  error: string | null;
  durationMs: number;
}

export interface AttemptInput {
  url: string;
  secret: string;
  body: string;
  eventId: string;
  eventType: string;
  deliveryId: string;
  timeoutMs: number;
  policy: UrlPolicy;
  now?: () => number;
}

const MAX_RESPONSE_BYTES = 64 * 1024;

export async function attemptDelivery(input: AttemptInput): Promise<AttemptResult> {
  const started = Date.now();
  const done = (r: Omit<AttemptResult, "durationMs">): AttemptResult => ({ ...r, durationMs: Date.now() - started });

  let target;
  try {
    target = await resolveSafeTarget(input.url, input.policy);
  } catch (err) {
    return done({ ok: false, statusCode: null, error: err instanceof UnsafeUrlError ? `Blocked: ${err.message}` : "Destination check failed." });
  }

  const timestamp = Math.floor((input.now?.() ?? Date.now()) / 1000);
  const signature = signPayload(input.secret, input.body, timestamp);
  const pinned: LookupFunction = (_host, opts, cb) => {
    if (opts && typeof opts === "object" && "all" in opts && opts.all) {
      (cb as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address: target.address, family: target.family }]);
    } else {
      cb(null, target.address, target.family);
    }
  };
  const lib = target.url.protocol === "https:" ? https : http;

  return new Promise<AttemptResult>((resolve) => {
    let settled = false;
    const finish = (r: Omit<AttemptResult, "durationMs">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(done(r));
    };

    const req = lib.request(
      {
        protocol: target.url.protocol,
        hostname: target.url.hostname.replace(/^\[|\]$/g, ""),
        port: target.url.port || undefined,
        path: `${target.url.pathname}${target.url.search}`,
        method: "POST",
        lookup: pinned,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(input.body),
          "User-Agent": "Yola-Webhooks/1.0",
          [SIGNATURE_HEADER]: signature,
          "Yola-Event-Id": input.eventId,
          "Yola-Event-Type": input.eventType,
          "Yola-Delivery-Id": input.deliveryId,
        },
      },
      (res) => {
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) res.destroy();
        });
        res.on("end", () => {
          const code = res.statusCode ?? 0;
          if (code >= 200 && code < 300) finish({ ok: true, statusCode: code, error: null });
          else if (code >= 300 && code < 400) finish({ ok: false, statusCode: code, error: "Redirects are not followed. Point the endpoint at the final URL." });
          else finish({ ok: false, statusCode: code, error: `Endpoint responded with HTTP ${code}.` });
        });
        res.on("error", () => finish({ ok: false, statusCode: res.statusCode ?? null, error: "The response was interrupted." }));
        res.on("close", () => {
          const code = res.statusCode ?? 0;
          if (!settled) finish(code >= 200 && code < 300 ? { ok: true, statusCode: code, error: null } : { ok: false, statusCode: code || null, error: `Endpoint responded with HTTP ${code}.` });
        });
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      finish({ ok: false, statusCode: null, error: `No response within ${Math.round(input.timeoutMs / 1000)} s.` });
    }, input.timeoutMs);
    req.on("error", (err: NodeJS.ErrnoException) => {
      const reason =
        err.code === "ECONNREFUSED" ? "Connection refused." :
        err.code === "ENOTFOUND" ? "Host not found." :
        err.code === "ECONNRESET" ? "Connection reset." :
        err.code?.startsWith("ERR_TLS") || err.code === "CERT_HAS_EXPIRED" || err.code === "DEPTH_ZERO_SELF_SIGNED_CERT" ? "TLS certificate problem." :
        "Could not connect.";
      finish({ ok: false, statusCode: null, error: reason });
    });
    req.end(input.body);
  });
}

/** Retry schedule after a failed attempt (attempt numbers are 1-based). */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000, 12 * 3600_000, 24 * 3600_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

export function nextAttemptDelay(attempt: number, random = Math.random): number | null {
  const base = RETRY_DELAYS_MS[attempt - 1];
  if (base === undefined) return null;
  return Math.round(base * (0.9 + random() * 0.2)); // ±10% jitter
}
