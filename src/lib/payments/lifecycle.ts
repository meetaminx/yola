import { assertTransition } from "./state-machine";
import type { EvidenceKind, PaymentRequest, PaymentStatus } from "./types";

/**
 * The one place a payment's status changes. Every caller (simulator,
 * verification service, merchant cancel, expiry sweep) goes through here,
 * so the state machine's evidence rules always apply.
 */
export function applyTransition<P extends PaymentRequest>(
  p: P,
  to: PaymentStatus,
  evidence: EvidenceKind,
  now: Date,
  note?: string,
): P {
  assertTransition(p.status, to, evidence);
  return {
    ...p,
    status: to,
    updated_at: now.toISOString(),
    history: [...p.history, { status: to, at: now.toISOString(), evidence, ...(note ? { note } : {}) }],
  };
}

/** Statuses that a passing deadline closes. Anything further along is left alone. */
const EXPIRABLE: ReadonlySet<PaymentStatus> = new Set(["awaiting_payment", "underpaid"]);

export function isDue(p: PaymentRequest, now: Date): boolean {
  return EXPIRABLE.has(p.status) && now.getTime() >= Date.parse(p.expires_at);
}

/**
 * Expire a request whose deadline has passed. Driven by a real clock, so
 * it is valid for every network. Returns the input unchanged if not due.
 */
export function expireIfDue<P extends PaymentRequest>(p: P, now: Date): P {
  return isDue(p, now) ? applyTransition(p, "expired", "clock", now, "Deadline passed") : p;
}

/** Merchant cancellation. Only open requests can be cancelled. */
export function cancelPayment<P extends PaymentRequest>(p: P, now: Date): P {
  return applyTransition(p, "cancelled", "merchant_action", now, "Cancelled by the merchant");
}
