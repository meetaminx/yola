"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { SIMULATE_ACTIONS } from "@/lib/payments/demo-adapter";
import { serializePayment } from "@/lib/payments/service";
import { createApiKey } from "@/lib/server/api-keys";
import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { kickJobs } from "@/lib/server/kick";
import { serverPaymentService } from "@/lib/server/payments";
import { PROJECT_COOKIE, requireProjectAccess, requireUser } from "@/lib/server/session";
import { prefixedId } from "@/lib/utils/ids";

/**
 * Dashboard mutations. Server Actions are POST-only and Next.js checks the
 * Origin header against the host, which protects them from CSRF. Every
 * action re-verifies the session and project membership.
 */

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; fields?: Record<string, string> };

function fieldErrors(error: z.ZodError) {
  const fields: Record<string, string> = {};
  for (const i of error.issues) fields[i.path.join(".") || "_"] ??= i.message;
  return fields;
}

function fail(err: unknown): { ok: false; error: string } {
  if (err instanceof ApiError) return { ok: false, error: err.message };
  if (err instanceof Error && err.message.startsWith("You do not have access")) return { ok: false, error: err.message };
  console.error(JSON.stringify({ level: "error", msg: "dashboard.action_failed", error: err instanceof Error ? err.message : String(err) }));
  return { ok: false, error: "Something went wrong. Try again." };
}

async function setProjectCookie(projectId: string) {
  (await cookies()).set(PROJECT_COOKIE, projectId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/* ── Projects ─────────────────────────────────────────────────────── */

const ProjectInput = z.object({
  name: z.string().trim().min(1, "Give the project a name.").max(80, "Use at most 80 characters."),
  description: z.string().trim().max(280, "Use at most 280 characters.").optional().transform((v) => v || null),
});

export async function createProjectAction(input: { name: string; description?: string }): Promise<ActionResult<{ projectId: string }>> {
  const user = await requireUser();
  const parsed = ProjectInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fields: fieldErrors(parsed.error) };
  try {
    const id = prefixedId("proj", 16);
    await db().$transaction(async (tx) => {
      await tx.project.create({ data: { id, name: parsed.data.name, description: parsed.data.description } });
      await tx.projectMember.create({ data: { projectId: id, userId: user.id, role: "owner" } });
      await audit(tx, { projectId: id, actor: { type: "user", id: user.id }, action: "project.created", target: { type: "project", id } });
    });
    await setProjectCookie(id);
    return { ok: true, projectId: id };
  } catch (err) {
    return fail(err);
  }
}

export async function switchProjectAction(projectId: string): Promise<ActionResult> {
  try {
    await requireProjectAccess(projectId);
    await setProjectCookie(projectId);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

const SettingsInput = ProjectInput.extend({
  defaultNetwork: z.enum(["demo", "testnet"], { error: "Choose demo or testnet. Mainnet is disabled." }),
  testnetConfirmations: z.coerce.number().int("Use a whole number.").min(1, "At least 1.").max(100, "At most 100."),
});

export async function updateProjectAction(
  projectId: string,
  input: { name: string; description?: string; defaultNetwork: string; testnetConfirmations: number | string },
): Promise<ActionResult> {
  try {
    const { user, role } = await requireProjectAccess(projectId);
    if (role !== "owner") return { ok: false, error: "Only project owners can change settings." };
    const parsed = SettingsInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fields: fieldErrors(parsed.error) };
    await db().project.update({ where: { id: projectId }, data: parsed.data });
    await audit(db(), {
      projectId,
      actor: { type: "user", id: user.id },
      action: "project.updated",
      target: { type: "project", id: projectId },
      details: { fields: Object.keys(parsed.data) },
    });
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/* ── API keys ─────────────────────────────────────────────────────── */

const KeyInput = z.object({
  name: z.string().trim().min(1, "Name the key after where it is used.").max(60, "Use at most 60 characters."),
  mode: z.enum(["test", "live"]),
});

export async function createApiKeyAction(
  projectId: string,
  input: { name: string; mode: string },
): Promise<ActionResult<{ secret: string; id: string; last4: string }>> {
  try {
    const { user } = await requireProjectAccess(projectId);
    const parsed = KeyInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: "Check the highlighted fields.", fields: fieldErrors(parsed.error) };
    if (parsed.data.mode === "live") {
      return { ok: false, error: "Live keys are unavailable while mainnet is disabled.", fields: { mode: "Live keys need mainnet." } };
    }
    const count = await db().apiKey.count({ where: { projectId, revokedAt: null } });
    if (count >= 20) return { ok: false, error: "A project can have at most 20 active keys. Revoke one you no longer use." };
    const key = await createApiKey(db(), { projectId, name: parsed.data.name, mode: parsed.data.mode, createdById: user.id });
    await audit(db(), {
      projectId,
      actor: { type: "user", id: user.id },
      action: "api_key.created",
      target: { type: "api_key", id: key.id },
      details: { mode: parsed.data.mode, name: parsed.data.name },
    });
    // The secret is returned once, to the creating user, and never stored.
    return { ok: true, secret: key.secret, id: key.id, last4: key.last4 };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeApiKeyAction(projectId: string, keyId: string): Promise<ActionResult> {
  try {
    const { user } = await requireProjectAccess(projectId);
    const result = await db().apiKey.updateMany({ where: { id: keyId, projectId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (result.count !== 1) return { ok: false, error: "That key does not exist or is already revoked." };
    await audit(db(), { projectId, actor: { type: "user", id: user.id }, action: "api_key.revoked", target: { type: "api_key", id: keyId } });
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

/* ── Payments ─────────────────────────────────────────────────────── */

export async function cancelPaymentAction(projectId: string, paymentId: string): Promise<ActionResult> {
  try {
    const { user } = await requireProjectAccess(projectId);
    await serverPaymentService().cancel({ projectId, allowedNetworks: ["demo", "testnet"] }, paymentId);
    await audit(db(), {
      projectId,
      actor: { type: "user", id: user.id },
      action: "payment_request.cancelled",
      target: { type: "payment_request", id: paymentId },
    });
    kickJobs();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function simulatePaymentAction(projectId: string, paymentId: string, action: string): Promise<ActionResult<{ status: string }>> {
  try {
    await requireProjectAccess(projectId);
    if (!(SIMULATE_ACTIONS as readonly string[]).includes(action)) return { ok: false, error: "Unknown simulator action." };
    const r = await serverPaymentService().simulate({ projectId, allowedNetworks: ["demo", "testnet"] }, paymentId, { action });
    kickJobs();
    return { ok: true, status: serializePayment(r.body).status };
  } catch (err) {
    return fail(err);
  }
}
