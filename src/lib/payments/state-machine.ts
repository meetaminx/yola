import type { EvidenceKind, PaymentStatus } from "./types";

/**
 * Payment lifecycle state machine.
 *
 * Every permitted transition names the evidence that must justify it.
 * Anything not listed here is rejected, so a status can never be set
 * arbitrarily (for example by a browser callback).
 *
 *   created → awaiting_payment → payment_detected → confirming → confirmed
 *
 * Reconciliation:
 *   payment_detected → underpaid           (observed amount < requested)
 *   confirming       → overpaid            (confirmed amount > requested; merchant decides refund)
 *   underpaid        → payment_detected    (a further matching output was observed)
 *   confirming       → payment_detected    (reorg: transaction lost depth)
 *   payment_detected → awaiting_payment    (reorg / dropped from mempool)
 *   underpaid        → awaiting_payment    (reorg / dropped: the partial payment vanished)
 *   *                → verification_required (the adapter cannot establish the facts,
 *                                            or a payment arrived after expiry/cancel)
 */
export const TRANSITIONS: Readonly<
  Record<PaymentStatus, Partial<Record<PaymentStatus, readonly EvidenceKind[]>>>
> = {
  created: {
    awaiting_payment: ["request_created"],
    cancelled: ["merchant_action"],
    failed: ["operator"],
  },
  awaiting_payment: {
    payment_detected: ["observation"],
    expired: ["clock"],
    cancelled: ["merchant_action"],
    verification_required: ["observation"],
  },
  payment_detected: {
    confirming: ["confirmation_depth"],
    underpaid: ["observation"],
    awaiting_payment: ["reorg"],
    verification_required: ["observation", "reorg"],
  },
  confirming: {
    confirmed: ["confirmation_depth"],
    overpaid: ["confirmation_depth"],
    payment_detected: ["reorg"],
    verification_required: ["reorg", "observation"],
  },
  underpaid: {
    payment_detected: ["observation"],
    awaiting_payment: ["reorg"],
    expired: ["clock"],
    verification_required: ["observation", "operator"],
  },
  // A deep reorg after confirmation is rare but must not be silently ignored.
  confirmed: {
    verification_required: ["reorg"],
  },
  overpaid: {
    verification_required: ["reorg"],
  },
  // A payment arriving after expiry or cancellation is a late payment: flag it, never auto-confirm.
  expired: {
    verification_required: ["observation"],
  },
  cancelled: {
    verification_required: ["observation"],
  },
  failed: {},
  verification_required: {
    confirming: ["operator"],
    confirmed: ["operator"],
    failed: ["operator"],
    cancelled: ["operator"],
  },
};

/** States where polling should stop: nothing further happens without new evidence or an operator. */
export const TERMINAL_STATUSES: ReadonlySet<PaymentStatus> = new Set([
  "confirmed",
  "overpaid",
  "expired",
  "cancelled",
  "failed",
]);

export function isTerminal(status: PaymentStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function canTransition(from: PaymentStatus, to: PaymentStatus, evidence: EvidenceKind): boolean {
  const allowed = TRANSITIONS[from][to];
  return allowed !== undefined && allowed.includes(evidence);
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: PaymentStatus,
    readonly to: PaymentStatus,
    readonly evidence: EvidenceKind,
  ) {
    super(`Cannot move a payment from "${from}" to "${to}" on "${evidence}" evidence.`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(from: PaymentStatus, to: PaymentStatus, evidence: EvidenceKind): void {
  if (!canTransition(from, to, evidence)) {
    throw new InvalidTransitionError(from, to, evidence);
  }
}

/** Human-facing copy for each status, shared by the demo, dashboard and status component. */
export const STATUS_COPY: Record<PaymentStatus, { label: string; detail: string }> = {
  created: { label: "Created", detail: "The request exists but is not yet open for payment." },
  awaiting_payment: { label: "Awaiting payment", detail: "Waiting for the customer to send ZEC." },
  payment_detected: {
    label: "Payment detected",
    detail: "A matching output was observed. It is not final until it has enough confirmations.",
  },
  confirming: { label: "Confirming", detail: "The transaction is in a block and gaining confirmations." },
  confirmed: { label: "Confirmed", detail: "The payment met the amount and confirmation policy." },
  expired: { label: "Expired", detail: "No qualifying payment arrived before the deadline." },
  cancelled: { label: "Cancelled", detail: "The merchant cancelled this request." },
  failed: { label: "Failed", detail: "The request could not be completed." },
  underpaid: {
    label: "Underpaid",
    detail: "Less than the requested amount arrived. The customer can send the difference.",
  },
  overpaid: {
    label: "Overpaid",
    detail: "More than the requested amount arrived and confirmed. Decide whether to refund the excess.",
  },
  verification_required: {
    label: "Needs review",
    detail: "The facts could not be established automatically. Review before fulfilling the order.",
  },
};
