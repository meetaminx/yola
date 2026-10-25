"use server";

import { audit } from "@/lib/server/audit";
import { db } from "@/lib/server/db";
import { requireProjectAccess } from "@/lib/server/session";
import { saveViewingKey, testnetScanner } from "@/lib/server/testnet";
import type { ActionResult } from "./actions";

/**
 * Viewing-key management. The pasted key goes straight to the scanner for
 * validation; only the encrypted incoming viewing key is stored, and the
 * key is never logged, audited or echoed back.
 */

const MAX_KEY_LENGTH = 2_000;

export async function saveViewingKeyAction(
  projectId: string,
  viewingKey: string,
): Promise<ActionResult<{ fingerprint: string; firstAddress: string; reducedFromFullKey: boolean }>> {
  try {
    const { user, role } = await requireProjectAccess(projectId);
    if (role !== "owner") return { ok: false, error: "Only project owners can manage the viewing key." };
    const key = String(viewingKey ?? "").trim();
    if (!key) return { ok: false, error: "Paste a unified viewing key.", fields: { viewingKey: "Required." } };
    if (key.length > MAX_KEY_LENGTH) return { ok: false, error: "That is too long to be a viewing key.", fields: { viewingKey: "Too long." } };
    const scanner = testnetScanner();
    if (!scanner) return { ok: false, error: "Testnet is not configured on this server." };

    const r = await saveViewingKey(db(), scanner, projectId, key);
    if (!r.ok) return { ok: false, error: r.message, fields: { viewingKey: r.message } };
    await audit(db(), {
      projectId,
      actor: { type: "user", id: user.id },
      action: "viewing_key.set",
      target: { type: "viewing_key", id: r.fingerprint },
      details: { network: "testnet", fingerprint: r.fingerprint, reduced_from_full: r.wasFullViewingKey },
    });
    return { ok: true, fingerprint: r.fingerprint, firstAddress: r.firstAddress, reducedFromFullKey: r.wasFullViewingKey };
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "dashboard.viewing_key_failed", error: err instanceof Error ? err.name : "error" }));
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

export async function removeViewingKeyAction(projectId: string): Promise<ActionResult> {
  try {
    const { user, role } = await requireProjectAccess(projectId);
    if (role !== "owner") return { ok: false, error: "Only project owners can manage the viewing key." };
    const open = await db().paymentRequest.count({
      where: { projectId, network: "testnet", status: { in: ["awaiting_payment", "payment_detected", "confirming", "underpaid"] } },
    });
    if (open > 0) {
      return { ok: false, error: `${open} testnet request${open === 1 ? " is" : "s are"} still open. Cancel or let them finish first, or their payments could not be detected.` };
    }
    const deleted = await db().viewingKey.deleteMany({ where: { projectId, network: "testnet" } });
    if (deleted.count) {
      await audit(db(), {
        projectId,
        actor: { type: "user", id: user.id },
        action: "viewing_key.removed",
        target: { type: "project", id: projectId },
        details: { network: "testnet" },
      });
    }
    return { ok: true };
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "dashboard.viewing_key_remove_failed", error: err instanceof Error ? err.name : "error" }));
    return { ok: false, error: "Something went wrong. Try again." };
  }
}
