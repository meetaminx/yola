import "server-only";
import { prefixedId } from "@/lib/utils/ids";
import type { Prisma } from "@/generated/prisma/client";
import type { Db, Tx } from "./db";
import { redact } from "./log";

export type AuditAction =
  | "project.created"
  | "project.updated"
  | "api_key.created"
  | "api_key.revoked"
  | "webhook_endpoint.created"
  | "webhook_endpoint.updated"
  | "webhook_endpoint.deleted"
  | "webhook_endpoint.secret_rotated"
  | "webhook.test_sent"
  | "webhook.redelivery_requested"
  | "payment_request.created"
  | "payment_request.cancelled"
  | "viewing_key.set"
  | "viewing_key.removed";

/**
 * Append an audit record. Details are passed through the log redactor, and
 * callers must not include secrets, keys, memos or customer data at all.
 */
export async function audit(
  prisma: Db | Tx,
  e: {
    projectId: string | null;
    actor: { type: "user" | "api_key" | "system"; id?: string | null };
    action: AuditAction;
    target?: { type: string; id: string };
    details?: Record<string, unknown>;
  },
) {
  await prisma.auditEvent.create({
    data: {
      id: prefixedId("aud"),
      projectId: e.projectId,
      actorType: e.actor.type,
      actorId: e.actor.id ?? null,
      action: e.action,
      targetType: e.target?.type ?? null,
      targetId: e.target?.id ?? null,
      details: redact(e.details ?? {}) as Prisma.InputJsonValue,
    },
  });
}
