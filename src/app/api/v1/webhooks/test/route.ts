import { audit } from "@/lib/server/audit";
import { readJson, v1 } from "@/lib/server/http";
import { queueTestEvent } from "@/lib/server/webhook-events";

/**
 * Queue a signed test event. Returns 202 with pending deliveries: success
 * is only reported (in delivery logs) after an attempt has completed.
 */
export const POST = v1(
  async (req, { auth, prisma, requestId }) => {
    const result = await queueTestEvent(prisma, auth.projectId, await readJson(req));
    await audit(prisma, {
      projectId: auth.projectId,
      actor: { type: "api_key", id: auth.apiKeyId },
      action: "webhook.test_sent",
      target: { type: "webhook_event", id: result.event_id },
      details: { request_id: requestId, endpoints: result.deliveries.length },
    });
    return { status: 202, body: result };
  },
  { limit: "webhookTest" },
);
