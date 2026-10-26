"use server";

import { kickJobs } from "@/lib/server/kick";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { audit } from "@/lib/server/audit";
import { encryptSecret } from "@/lib/server/crypto";
import { db } from "@/lib/server/db";
import { getEnv } from "@/lib/server/env";
import { requireProjectAccess } from "@/lib/server/session";
import { resolveSafeTarget, UnsafeUrlError } from "@/lib/server/ssrf";
import { queueTestEvent } from "@/lib/server/webhook-events";
import { prefixedId, randomToken } from "@/lib/utils/ids";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhooks/events";
import type { ActionResult } from "./actions";

const MAX_ENDPOINTS = 10;

const EndpointInput = z.object({
  url: z.string().trim().min(1, "Enter the URL that should receive events."),
  description: z.string().trim().max(120, "Use at most 120 characters.").optional().transform((v) => v || null),
  eventTypes: z.array(z.enum(WEBHOOK_EVENT_TYPES)).max(WEBHOOK_EVENT_TYPES.length),
});

function newSecret() {
  return `whsec_${randomToken(32)}`;
}

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError || err instanceof UnsafeUrlError) return { ok: false, error: err.message };
  if (err instanceof Error && err.message.startsWith("You do not have access")) return { ok: false, error: err.message };
  console.error(JSON.stringify({ level: "error", msg: "dashboard.webhook_action_failed", error: err instanceof Error ? err.message : String(err) }));
  return { ok: false, error: "Something went wrong. Try again." };
}

export async function createWebhookEndpointAction(
  projectId: string,
  input: { url: string; description?: string; eventTypes: string[] },
): Promise<ActionResult<{ secret: string; id: string }>> {
  try {
    const { user } = await requireProjectAccess(projectId);
    const parsed = EndpointInput.safeParse(input);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const i of parsed.error.issues) fields[String(i.path[0] ?? "_")] ??= i.message;
      return { ok: false, error: "Check the highlighted fields.", fields };
    }
    try {
      // Resolves DNS now, so an internal destination is rejected at creation; it is checked again on every delivery.
      await resolveSafeTarget(parsed.data.url, { allowPrivate: getEnv().YOLA_WEBHOOK_ALLOW_PRIVATE_NETWORKS });
    } catch (err) {
      if (err instanceof UnsafeUrlError) return { ok: false, error: err.message, fields: { url: err.message } };
      throw err;
    }
    if ((await db().webhookEndpoint.count({ where: { projectId } })) >= MAX_ENDPOINTS) {
      return { ok: false, error: `A project can have at most ${MAX_ENDPOINTS} webhook endpoints.` };
    }
    const id = prefixedId("we", 16);
    const secret = newSecret();
    await db().webhookEndpoint.create({
      data: {
        id,
        projectId,
        url: parsed.data.url,
        description: parsed.data.description,
        eventTypes: parsed.data.eventTypes,
        secretEncrypted: encryptSecret(secret, `webhook:${id}`),
      },
    });
    await audit(db(), {
      projectId,
      actor: { type: "user", id: user.id },
      action: "webhook_endpoint.created",
      target: { type: "webhook_endpoint", id },
      details: { host: new URL(parsed.data.url).host, events: parsed.data.eventTypes.length || "all" },
    });
    return { ok: true, secret, id };
  } catch (err) {
    return fail(err);
  }
}

export async function setWebhookEnabledAction(projectId: string, endpointId: string, enabled: boolean): Promise<ActionResult> {
  try {
    const { user } = await requireProjectAccess(projectId);
    const r = await db().webhookEndpoint.updateMany({ where: { id: endpointId, projectId }, data: { enabled } });
    if (r.count !== 1) return { ok: false, error: "That endpoint no longer exists." };
    await audit(db(), {
      projectId,
      actor: { type: "user", id: user.id },
      action: "webhook_endpoint.updated",
      target: { type: "webhook_endpoint", id: endpointId },
      details: { enabled },
    });
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteWebhookEndpointAction(projectId: string, endpointId: string): Promise<ActionResult> {
  try {
    const { user } = await requireProjectAccess(projectId);
    const r = await db().webhookEndpoint.deleteMany({ where: { id: endpointId, projectId } });
    if (r.count !== 1) return { ok: false, error: "That endpoint no longer exists." };
    await audit(db(), { projectId, actor: { type: "user", id: user.id }, action: "webhook_endpoint.deleted", target: { type: "webhook_endpoint", id: endpointId } });
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function rotateWebhookSecretAction(projectId: string, endpointId: string): Promise<ActionResult<{ secret: string }>> {
  try {
    const { user } = await requireProjectAccess(projectId);
    const secret = newSecret();
    const r = await db().webhookEndpoint.updateMany({
      where: { id: endpointId, projectId },
      data: { secretEncrypted: encryptSecret(secret, `webhook:${endpointId}`) },
    });
    if (r.count !== 1) return { ok: false, error: "That endpoint no longer exists." };
    await audit(db(), { projectId, actor: { type: "user", id: user.id }, action: "webhook_endpoint.secret_rotated", target: { type: "webhook_endpoint", id: endpointId } });
    return { ok: true, secret };
  } catch (err) {
    return fail(err);
  }
}

export async function sendTestEventAction(projectId: string, endpointId: string): Promise<ActionResult<{ eventId: string }>> {
  try {
    const { user } = await requireProjectAccess(projectId);
    const r = await queueTestEvent(db(), projectId, { endpoint_id: endpointId });
    await audit(db(), { projectId, actor: { type: "user", id: user.id }, action: "webhook.test_sent", target: { type: "webhook_event", id: r.event_id } });
    kickJobs();
    return { ok: true, eventId: r.event_id };
  } catch (err) {
    return fail(err);
  }
}

export async function redeliverAction(projectId: string, deliveryId: string): Promise<ActionResult> {
  try {
    const { user } = await requireProjectAccess(projectId);
    const r = await db().webhookDelivery.updateMany({
      where: { id: deliveryId, projectId, status: { in: ["failed", "succeeded"] } },
      data: { status: "pending", nextAttemptAt: new Date(), lockedUntil: null, completedAt: null },
    });
    if (r.count !== 1) return { ok: false, error: "That delivery is already queued or no longer exists." };
    await audit(db(), { projectId, actor: { type: "user", id: user.id }, action: "webhook.redelivery_requested", target: { type: "webhook_delivery", id: deliveryId } });
    kickJobs();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
