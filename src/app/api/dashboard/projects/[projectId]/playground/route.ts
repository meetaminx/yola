import { headers } from "next/headers";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { dispatchPaymentRoute } from "@/lib/api/router";
import { auth } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { getEnv } from "@/lib/server/env";
import { jsonResponse } from "@/lib/server/http";
import { serverPaymentService } from "@/lib/server/payments";
import { prefixedId } from "@/lib/utils/ids";

/**
 * Dashboard playground transport. The signed-in user's session stands in
 * for an API key, restricted to their project and to test networks.
 * Cookie-authenticated, so it requires a same-origin request (CSRF).
 */

const Call = z.strictObject({
  method: z.enum(["GET", "POST"]),
  path: z.string().startsWith("/payment-requests").max(300),
  body: z.unknown().optional(),
  idempotencyKey: z.string().max(255).nullable().optional(),
});

export async function POST(req: Request, ctx: RouteContext<"/api/dashboard/projects/[projectId]/playground">) {
  const requestId = prefixedId("req", 16);
  try {
    const origin = req.headers.get("origin");
    const expected = new URL(getEnv().YOLA_PUBLIC_APP_URL).origin;
    if (origin !== expected || req.headers.get("sec-fetch-site") === "cross-site") {
      throw new ApiError(403, "forbidden", "Cross-site requests are not allowed.");
    }
    const session = await auth().api.getSession({ headers: await headers() });
    if (!session) throw new ApiError(401, "unauthenticated", "Sign in again to use the playground.");
    const { projectId } = await ctx.params;
    const member = await db().projectMember.findUnique({ where: { projectId_userId: { projectId, userId: session.user.id } } });
    if (!member) throw new ApiError(404, "not_found", "No project with that ID exists for your account.");

    const parsed = Call.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(422, "invalid_request", "Malformed playground call.");
    const result = await dispatchPaymentRoute(serverPaymentService(), { projectId, allowedNetworks: ["demo", "testnet"] }, parsed.data);
    return jsonResponse(200, {
      status: result.status,
      headers: { "x-request-id": requestId, ...(result.replayed ? { "idempotent-replayed": "true" } : {}) },
      body: result.body,
    });
  } catch (err) {
    const e = err instanceof ApiError ? err : new ApiError(500, "internal_error", "Something went wrong on our side.");
    if (!(err instanceof ApiError)) console.error(JSON.stringify({ level: "error", msg: "dashboard.playground_failed", request_id: requestId }));
    // The playground displays the API's own error, so wrap it rather than failing the transport.
    return jsonResponse(200, { status: e.status, headers: { "x-request-id": requestId }, body: e.toBody(requestId) });
  }
}
