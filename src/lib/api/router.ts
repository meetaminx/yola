import { ApiError } from "./errors";
import { parseListQuery } from "./schemas";
import type { PaymentService, RequestContext, ServiceResult } from "@/lib/payments/service";

/**
 * Transport-neutral router for the payment-request endpoints. The Next.js
 * route handlers and the in-browser simulator gateway both dispatch here,
 * so a request behaves identically in either place.
 */

export interface ApiCall {
  method: string;
  /** Path under /api/v1, with optional query string, e.g. "/payment-requests?limit=5". */
  path: string;
  /** Parsed JSON body, or undefined. */
  body?: unknown;
  idempotencyKey?: string | null;
}

const PAYMENT = /^\/payment-requests\/([^/]+)$/;
const PAYMENT_STATUS = /^\/payment-requests\/([^/]+)\/status$/;
const PAYMENT_CANCEL = /^\/payment-requests\/([^/]+)\/cancel$/;
const PAYMENT_SIMULATE = /^\/payment-requests\/([^/]+)\/simulate$/;

export async function dispatchPaymentRoute(
  service: PaymentService,
  ctx: RequestContext,
  call: ApiCall,
): Promise<ServiceResult> {
  const url = new URL(call.path, "http://local");
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const m = call.method.toUpperCase();
  let match: RegExpExecArray | null;

  if (path === "/payment-requests") {
    if (m === "POST") return service.create(ctx, call.body, call.idempotencyKey ?? null);
    if (m === "GET") return service.list(ctx, parseListQuery(url.searchParams));
    throw methodNotAllowed();
  }
  if ((match = PAYMENT_STATUS.exec(path))) {
    if (m === "GET") return service.status(ctx, decodeURIComponent(match[1]));
    throw methodNotAllowed();
  }
  if ((match = PAYMENT_CANCEL.exec(path))) {
    if (m === "POST") return service.cancel(ctx, decodeURIComponent(match[1]));
    throw methodNotAllowed();
  }
  if ((match = PAYMENT_SIMULATE.exec(path))) {
    if (m === "POST") return service.simulate(ctx, decodeURIComponent(match[1]), call.body);
    throw methodNotAllowed();
  }
  if ((match = PAYMENT.exec(path))) {
    if (m === "GET") return service.retrieve(ctx, decodeURIComponent(match[1]));
    throw methodNotAllowed();
  }
  throw new ApiError(404, "not_found", `No endpoint matches ${m} /api/v1${path}.`);
}

function methodNotAllowed() {
  return new ApiError(405, "method_not_allowed", "That method is not supported on this endpoint.");
}
