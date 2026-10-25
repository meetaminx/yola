import { compareAmounts, formatZecFixed, formatZecTrimmed } from "./amount";
import { assertTransition, isTerminal } from "./state-machine";
import type { EvidenceKind, PaymentRequest, PaymentStatus } from "./types";

/**
 * Yola demo simulator.
 *
 * Runs entirely in memory with synthetic data. It never contacts a Zcash
 * node and never produces anything that looks like a real transaction:
 * - destinations are the literal string "demo-destination"
 * - the QR payload uses a "yola-demo:" scheme no wallet will treat as Zcash
 * - transaction IDs are prefixed "sim_" and are not 32-byte hashes
 *
 * It still goes through the real state machine, so the demo exercises
 * the same transition rules as production.
 */

export const DEMO_DESTINATION = "demo-destination";
export const DEMO_QR_SCHEME = "yola-demo:";
/** Simulated confirmation policy. Real policies are configured per project. */
export const DEMO_REQUIRED_CONFIRMATIONS = 3;

function randomId(prefix: string, bytes = 12): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (const b of buf) out += alphabet[b % alphabet.length];
  return `${prefix}_${out}`;
}

export interface CreateDemoInput {
  amountZatoshis: bigint;
  description?: string;
  externalReference?: string;
  /** Seconds until expiry. */
  expiresIn?: number;
  now?: Date;
}

export function createDemoPaymentRequest(input: CreateDemoInput): PaymentRequest {
  const now = input.now ?? new Date();
  const id = randomId("pay_demo");
  const expires = new Date(now.getTime() + (input.expiresIn ?? 15 * 60) * 1000);
  const amount = formatZecTrimmed(input.amountZatoshis);

  const base: PaymentRequest = {
    id,
    amount: formatZecFixed(input.amountZatoshis),
    amount_zatoshis: input.amountZatoshis.toString(),
    currency: "ZEC",
    network: "demo",
    trust_level: "simulated",
    destination: DEMO_DESTINATION,
    description: input.description?.trim() || null,
    external_reference: input.externalReference ?? null,
    status: "created",
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
    payment_uri: null,
    qr_payload: `${DEMO_QR_SCHEME}${id}?amount=${amount}&simulated=true`,
    status_url: `/api/v1/payment-requests/${id}/status`,
    confirmations: null,
    amount_received_zatoshis: null,
    transaction_id: null,
    history: [{ status: "created", at: now.toISOString(), evidence: "request_created" }],
  };
  return transition(base, "awaiting_payment", "request_created", now);
}

function transition(
  p: PaymentRequest,
  to: PaymentStatus,
  evidence: EvidenceKind,
  now: Date,
  note?: string,
): PaymentRequest {
  if (p.network !== "demo") {
    // The simulator may only act on simulated payments, ever.
    throw new Error("The demo simulator cannot change a non-demo payment.");
  }
  assertTransition(p.status, to, evidence);
  return {
    ...p,
    status: to,
    history: [...p.history, { status: to, at: now.toISOString(), evidence, note }],
  };
}

/** Simulate the customer's wallet sending `zatoshis`. Defaults to the exact amount. */
export function simulateIncomingPayment(
  p: PaymentRequest,
  zatoshis?: bigint,
  now: Date = new Date(),
): PaymentRequest {
  const requested = BigInt(p.amount_zatoshis);
  const already = p.amount_received_zatoshis ? BigInt(p.amount_received_zatoshis) : 0n;
  const received = already + (zatoshis ?? requested - already);

  let next = transition(p, "payment_detected", "observation", now, "Simulated mempool observation");
  next = {
    ...next,
    amount_received_zatoshis: received.toString(),
    transaction_id: next.transaction_id ?? randomId("sim_tx", 10),
  };
  if (compareAmounts(received, requested) === "under") {
    next = transition(next, "underpaid", "observation", now, "Simulated amount below request");
  }
  return next;
}

/** Simulate one more block on top of the (simulated) transaction. */
export function simulateConfirmation(p: PaymentRequest, now: Date = new Date()): PaymentRequest {
  if (p.status === "payment_detected") {
    return {
      ...transition(p, "confirming", "confirmation_depth", now, "Simulated: included in a block"),
      confirmations: { observed: 1, required: DEMO_REQUIRED_CONFIRMATIONS },
    };
  }
  if (p.status === "confirming" && p.confirmations) {
    const observed = p.confirmations.observed + 1;
    const updated = { ...p, confirmations: { ...p.confirmations, observed } };
    if (observed < p.confirmations.required) return updated;
    const over =
      p.amount_received_zatoshis && BigInt(p.amount_received_zatoshis) > BigInt(p.amount_zatoshis);
    return transition(updated, over ? "overpaid" : "confirmed", "confirmation_depth", now, "Simulated policy met");
  }
  throw new Error(`Nothing to confirm while the payment is "${p.status}".`);
}

export function simulateExpiry(p: PaymentRequest, now: Date = new Date()): PaymentRequest {
  return transition(p, "expired", "clock", now, "Simulated deadline passed");
}

export function simulateReorg(p: PaymentRequest, now: Date = new Date()): PaymentRequest {
  if (p.status === "confirming") {
    return { ...transition(p, "payment_detected", "reorg", now, "Simulated reorg"), confirmations: null };
  }
  throw new Error("A reorg can only be simulated while confirming.");
}

export function cancelDemo(p: PaymentRequest, now: Date = new Date()): PaymentRequest {
  return transition(p, "cancelled", "merchant_action", now);
}

export { isTerminal };
