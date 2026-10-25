import "server-only";
import { dispatchPaymentRoute } from "@/lib/api/router";
import { audit } from "./audit";
import { readJson, v1 } from "./http";
import { serverPaymentService } from "./payments";

/**
 * The payment-request endpoints all dispatch through the same
 * transport-neutral router as the in-browser simulator.
 */
async function dispatch(req: Request, ctx: Parameters<Parameters<typeof v1>[0]>[1]) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/v1/, "") + url.search;
  const body = req.method === "POST" ? await readJson(req) : undefined;
  const result = await dispatchPaymentRoute(serverPaymentService(), ctx.auth, {
    method: req.method,
    path,
    body,
    idempotencyKey: req.headers.get("idempotency-key"),
  });

  // Audit state-changing calls (never the body: it may contain customer data).
  if (req.method === "POST" && result.status < 300 && !result.replayed) {
    const id = (result.body as { id?: string }).id;
    const action = path.startsWith("/payment-requests?") || path === "/payment-requests" ? "payment_request.created" : path.endsWith("/cancel") ? "payment_request.cancelled" : null;
    if (action && id) {
      await audit(ctx.prisma, {
        projectId: ctx.auth.projectId,
        actor: { type: "api_key", id: ctx.auth.apiKeyId },
        action,
        target: { type: "payment_request", id },
        details: { request_id: ctx.requestId },
      });
    }
  }
  return result;
}

export const paymentRoute = v1(dispatch);
export const createRoute = v1(dispatch, { limit: "create" });
