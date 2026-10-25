import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { prefixedId } from "@/lib/utils/ids";
import { testEventPayload } from "@/lib/webhooks/events";
import type { Prisma } from "@/generated/prisma/client";
import type { Db } from "./db";

const TestSchema = z.strictObject({ endpoint_id: z.string().regex(/^we_[0-9a-z]{16,32}$/).optional() });

/**
 * Queue a signed "webhook.test" event for the project's endpoints (or one).
 * Responds with the queued deliveries. Their outcome is only known after a
 * delivery attempt completes, so it is never reported as delivered here.
 */
export async function queueTestEvent(prisma: Db, projectId: string, body: unknown) {
  const parsed = TestSchema.safeParse(body ?? {});
  if (!parsed.success) {
    throw new ApiError(422, "invalid_request", "The request body is invalid.", { endpoint_id: "Must be an endpoint ID like we_..." });
  }
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { projectId, enabled: true, ...(parsed.data.endpoint_id ? { id: parsed.data.endpoint_id } : {}) },
    select: { id: true, url: true },
  });
  if (endpoints.length === 0) {
    throw new ApiError(
      422,
      "webhook_endpoint_missing",
      parsed.data.endpoint_id ? "No enabled webhook endpoint with that ID exists in this project." : "This project has no enabled webhook endpoints. Add one in the dashboard first.",
    );
  }
  const id = prefixedId("evt");
  const now = new Date();
  const deliveries = endpoints.map((e) => ({ id: prefixedId("whd"), endpointId: e.id }));
  await prisma.$transaction([
    prisma.webhookEvent.create({
      data: { id, projectId, type: "webhook.test", payload: testEventPayload(id, now.toISOString()) as unknown as Prisma.InputJsonValue, createdAt: now },
    }),
    prisma.webhookDelivery.createMany({ data: deliveries.map((d) => ({ ...d, eventId: id, projectId })) }),
  ]);
  return {
    event_id: id,
    type: "webhook.test",
    deliveries: deliveries.map((d) => ({ id: d.id, endpoint_id: d.endpointId, status: "pending" as const })),
  };
}
