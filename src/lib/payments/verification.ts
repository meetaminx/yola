import { applyTransition } from "./lifecycle";
import type { PaymentRequest, PaymentStatus } from "./types";

/**
 * Payment verification: turns chain evidence into status transitions.
 *
 * Pure and deterministic. The scanner job gathers the evidence (outputs that
 * trial-decrypted to this request's address, with their heights) and this
 * decides what it proves. Every change goes through applyTransition, so the
 * state machine's evidence rules hold here exactly as in the simulator.
 *
 * Rules:
 * - An output counts only if the backend decrypted it with the merchant's
 *   viewing key AND it was sent to this request's per-request address. Both
 *   are established by the scanner; nothing from a browser is accepted.
 * - Received = sum of every currently valid output (several transactions may
 *   add up to the amount).
 * - Depth = confirmations of the shallowest output; 0 while any output is
 *   still in the mempool.
 * - Confirmed (or overpaid) requires received >= requested AND depth >=
 *   the project's required confirmations.
 * - A reorg or a dropped transaction walks the status back. After
 *   confirmation it becomes "verification_required": never silently undone,
 *   never silently kept.
 * - Anything first seen after the deadline, or after the request closed, is
 *   a late payment: "verification_required", never auto-confirmed.
 */

export interface ChainObservation {
  txid: string;
  valueZatoshis: bigint;
  /** Null while only in the mempool. */
  height: number | null;
  /** When Yola first saw this output. */
  firstSeenAt: Date;
}

export interface VerificationContext {
  tipHeight: number;
  requiredConfirmations: number;
  now: Date;
}

const OPEN: ReadonlySet<PaymentStatus> = new Set(["created", "awaiting_payment", "payment_detected", "confirming", "underpaid"]);

export function depthOf(observations: readonly ChainObservation[], tipHeight: number): number {
  if (observations.length === 0) return 0;
  let depth = Infinity;
  for (const o of observations) {
    if (o.height === null || o.height > tipHeight) return 0;
    depth = Math.min(depth, tipHeight - o.height + 1);
  }
  return depth;
}

function evidenceFields<P extends PaymentRequest>(p: P, obs: readonly ChainObservation[], received: bigint, depth: number, required: number): P {
  const first = [...obs].sort((a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime() || (a.txid < b.txid ? -1 : 1))[0];
  return {
    ...p,
    amount_received_zatoshis: received > 0n ? received.toString() : null,
    transaction_id: first?.txid ?? null,
    confirmations: received > 0n ? { observed: depth, required } : null,
  };
}

function sameEvidence(a: PaymentRequest, b: PaymentRequest): boolean {
  return (
    a.status === b.status &&
    a.amount_received_zatoshis === b.amount_received_zatoshis &&
    a.transaction_id === b.transaction_id &&
    a.confirmations?.observed === b.confirmations?.observed &&
    a.confirmations?.required === b.confirmations?.required
  );
}

/**
 * Reconcile a payment with the outputs currently known to pay it.
 * Returns the same object when nothing changed, so callers can skip the write.
 */
export function reconcilePayment<P extends PaymentRequest>(p: P, observations: readonly ChainObservation[], ctx: VerificationContext): P {
  if (p.network === "demo" || p.trust_level === "simulated") {
    throw new Error("Chain verification never applies to simulated payments.");
  }
  const requested = BigInt(p.amount_zatoshis);
  const received = observations.reduce((sum, o) => sum + o.valueZatoshis, 0n);
  const depth = depthOf(observations, ctx.tipHeight);
  const required = Math.max(1, ctx.requiredConfirmations);
  const now = ctx.now;
  const deadline = Date.parse(p.expires_at);
  let next: P = p;
  const go = (to: PaymentStatus, evidence: Parameters<typeof applyTransition>[2], note: string) => {
    next = applyTransition(next, to, evidence, now, note);
  };

  // Closed requests: any payment now is a late payment for a human to review.
  if (p.status === "expired" || p.status === "cancelled") {
    if (observations.length === 0) return p;
    go("verification_required", "observation", `A payment arrived after the request was ${p.status}. Review before fulfilling or refunding.`);
    return evidenceFields(next, observations, received, depth, required);
  }

  // Settled requests: only a reorg that undermines the evidence changes anything.
  if (p.status === "confirmed" || p.status === "overpaid") {
    if (received >= requested && depth >= 1) return p;
    go("verification_required", "reorg", "A confirmed payment left the best chain. Review before relying on it.");
    return evidenceFields(next, observations, received, depth, required);
  }

  if (!OPEN.has(p.status)) return p; // verification_required, failed: operator territory

  // Late outputs on an open request: close it, then flag the late payment.
  if (observations.some((o) => o.firstSeenAt.getTime() > deadline)) {
    if (next.status === "awaiting_payment" || next.status === "underpaid") {
      go("expired", "clock", "Deadline passed");
      go("verification_required", "observation", "A payment arrived after the deadline. Review before fulfilling or refunding.");
      return evidenceFields(next, observations, received, depth, required);
    }
    // Already detected or confirming in time: a later extra output does not change the outcome.
  }

  // Walk back on reorgs and dropped transactions.
  if (next.status === "confirming" && (depth === 0 || received < requested)) {
    go("payment_detected", "reorg", depth === 0 ? "The transaction left the best chain" : "Part of the payment left the best chain");
  }
  if (received === 0n && (next.status === "payment_detected" || next.status === "underpaid")) {
    go("awaiting_payment", "reorg", "The observed payment is no longer on the chain or in the mempool");
  }

  // Move forward on new evidence.
  const previous = p.amount_received_zatoshis ? BigInt(p.amount_received_zatoshis) : 0n;
  if (next.status === "awaiting_payment" && received > 0n) {
    go("payment_detected", "observation", depth === 0 ? "Seen in the mempool" : `Seen in block ${ctx.tipHeight - depth + 1}`);
  } else if (next.status === "underpaid" && received > previous) {
    go("payment_detected", "observation", "A further payment was observed");
  }
  if (next.status === "payment_detected" && received < requested) {
    go("underpaid", "observation", "Less than the requested amount has arrived");
  }
  if (next.status === "payment_detected" && depth >= 1) {
    go("confirming", "confirmation_depth", "Included in a block");
  }
  if (next.status === "confirming" && depth >= required) {
    go(received > requested ? "overpaid" : "confirmed", "confirmation_depth", `${depth} confirmations (policy: ${required})`);
  }

  const withEvidence = evidenceFields(next, observations, received, depth, required);
  if (next === p && sameEvidence(withEvidence, p)) return p;
  return { ...withEvidence, updated_at: now.toISOString() };
}
