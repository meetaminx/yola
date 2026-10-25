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

/**
 * `observedThrough` is how far the payment's evidence source has looked: a
 * request may only expire once a look that began after its deadline found
 * nothing. The simulator sees everything instantly (observedThrough = now);
 * for a chain it is the start of the scanner's last complete pass, and null
 * (never scanned) means it cannot expire yet.
 */
export function isDue(p: PaymentRequest, now: Date, observedThrough: Date | null = now): boolean {
  const deadline = Date.parse(p.expires_at);
  return EXPIRABLE.has(p.status) && now.getTime() >= deadline && observedThrough !== null && observedThrough.getTime() >= deadline;
}

/**
 * Expire a request whose deadline has passed and whose evidence source has
 * looked past the deadline. Returns the input unchanged if not due.
 */
export function expireIfDue<P extends PaymentRequest>(p: P, now: Date, observedThrough: Date | null = now): P {
  return isDue(p, now, observedThrough) ? applyTransition(p, "expired", "clock", now, "Deadline passed") : p;
}

/** Merchant cancellation. Only open requests can be cancelled. */
export function cancelPayment<P extends PaymentRequest>(p: P, now: Date): P {
  return applyTransition(p, "cancelled", "merchant_action", now, "Cancelled by the merchant");
}
