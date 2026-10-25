import { prefixedId } from "@/lib/utils/ids";
import { compareAmounts, formatZecFixed, formatZecTrimmed } from "./amount";
import { applyTransition, cancelPayment } from "./lifecycle";
import { isTerminal } from "./state-machine";
import type { EvidenceKind, PaymentRequest, PaymentStatus } from "./types";

/**
 * Yola demo simulator.
 *
 * Runs with synthetic data. It never contacts a Zcash node and never
 * produces anything that looks like a real transaction:
 * - destinations are the literal string "demo-destination"
 * - the QR payload uses a "yola-demo:" scheme no wallet will treat as Zcash
 * - transaction IDs are prefixed "sim_tx_" and are not 32-byte hashes
 *
 * It still goes through the real state machine, so the demo exercises
 * the same transition rules as production.
 */

export const DEMO_DESTINATION = "demo-destination";
export const DEMO_QR_SCHEME = "yola-demo:";
/** Simulated confirmation policy. Real policies are configured per project. */
export const DEMO_REQUIRED_CONFIRMATIONS = 3;

export interface CreateDemoInput {
  amountZatoshis: bigint;
  description?: string | null;
  externalReference?: string | null;
  metadata?: Record<string, string>;
  /** Seconds until expiry. */
  expiresIn?: number;
  now?: Date;
  /** Supply an ID (the server does, so it can store it first). */
  id?: string;
}

export function createDemoPaymentRequest(input: CreateDemoInput): PaymentRequest {
  const now = input.now ?? new Date();
  const id = input.id ?? prefixedId("pay_demo");
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
    metadata: input.metadata ?? {},
    status: "created",
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
    payment_uri: null,
    qr_payload: `${DEMO_QR_SCHEME}${id}?amount=${amount}&simulated=true`,
    status_url: `/api/v1/payment-requests/${id}/status`,
    confirmations: null,
    amount_received_zatoshis: null,
    transaction_id: null,
    updated_at: now.toISOString(),
    history: [{ status: "created", at: now.toISOString(), evidence: "request_created" }],
  };
  return transition(base, "awaiting_payment", "request_created", now);
}

function transition<P extends PaymentRequest>(
  p: P,
  to: PaymentStatus,
  evidence: EvidenceKind,
  now: Date,
  note?: string,
): P {
  assertDemo(p);
  return applyTransition(p, to, evidence, now, note);
}

/** The simulator may only act on simulated payments, ever. */
function assertDemo(p: PaymentRequest) {
  if (p.network !== "demo" || p.trust_level !== "simulated") {
    throw new Error("The demo simulator cannot change a non-demo payment.");
  }
}

/** Simulate the customer's wallet sending `zatoshis`. Defaults to the outstanding amount. */
export function simulateIncomingPayment<P extends PaymentRequest>(p: P, zatoshis?: bigint, now: Date = new Date()): P {
  const requested = BigInt(p.amount_zatoshis);
  const already = p.amount_received_zatoshis ? BigInt(p.amount_received_zatoshis) : 0n;
  const sent = zatoshis ?? requested - already;
  if (sent <= 0n) throw new Error("A simulated payment must send more than zero.");
  const received = already + sent;

  let next = transition(p, "payment_detected", "observation", now, "Simulated mempool observation");
  next = {
    ...next,
    amount_received_zatoshis: received.toString(),
    transaction_id: next.transaction_id ?? prefixedId("sim_tx", 16),
  };
  if (compareAmounts(received, requested) === "under") {
    next = transition(next, "underpaid", "observation", now, "Simulated amount below request");
  }
  return next;
}

/** Simulate one more block on top of the (simulated) transaction. */
export function simulateConfirmation<P extends PaymentRequest>(p: P, now: Date = new Date()): P {
  if (p.status === "payment_detected") {
    return {
      ...transition(p, "confirming", "confirmation_depth", now, "Simulated: included in a block"),
      confirmations: { observed: 1, required: DEMO_REQUIRED_CONFIRMATIONS },
    };
  }
  if (p.status === "confirming" && p.confirmations) {
    const observed = p.confirmations.observed + 1;
    const updated = { ...p, confirmations: { ...p.confirmations, observed }, updated_at: now.toISOString() };
    if (observed < p.confirmations.required) return updated;
    const over = p.amount_received_zatoshis !== null && BigInt(p.amount_received_zatoshis) > BigInt(p.amount_zatoshis);
    return transition(updated, over ? "overpaid" : "confirmed", "confirmation_depth", now, "Simulated policy met");
  }
  throw new Error(`Nothing to confirm while the payment is "${p.status}".`);
}

/** Close the request as if its deadline had passed, without waiting for the clock. */
export function simulateExpiry<P extends PaymentRequest>(p: P, now: Date = new Date()): P {
  return transition(p, "expired", "clock", now, "Simulated deadline passed");
}

export function simulateReorg<P extends PaymentRequest>(p: P, now: Date = new Date()): P {
  if (p.status !== "confirming") throw new Error("A reorg can only be simulated while confirming.");
  return { ...transition(p, "payment_detected", "reorg", now, "Simulated reorg"), confirmations: null };
}

export function cancelDemo<P extends PaymentRequest>(p: P, now: Date = new Date()): P {
  assertDemo(p);
  return cancelPayment(p, now);
}

/** Simulator actions, as named in the API's /simulate endpoint. */
export const SIMULATE_ACTIONS = ["pay", "pay_partial", "pay_extra", "mine_block", "reorg", "expire"] as const;
export type SimulateAction = (typeof SIMULATE_ACTIONS)[number];

export function runSimulation<P extends PaymentRequest>(p: P, action: SimulateAction, now: Date = new Date()): P {
  const requested = BigInt(p.amount_zatoshis);
  switch (action) {
    case "pay":
      return simulateIncomingPayment(p, undefined, now);
    case "pay_partial":
      return simulateIncomingPayment(p, requested / 2n > 0n ? requested / 2n : 1n, now);
    case "pay_extra":
      return simulateIncomingPayment(p, (requested * 6n) / 5n, now);
    case "mine_block":
      return simulateConfirmation(p, now);
    case "reorg":
      return simulateReorg(p, now);
    case "expire":
      return simulateExpiry(p, now);
  }
}

/** Which simulator actions are valid from a status, for building controls. */
export function availableSimulations(status: PaymentStatus): SimulateAction[] {
  switch (status) {
    case "awaiting_payment":
      return ["pay", "pay_partial", "pay_extra", "expire"];
    case "underpaid":
      return ["pay", "expire"];
    case "payment_detected":
      return ["mine_block"];
    case "confirming":
      return ["mine_block", "reorg"];
    default:
      return [];
  }
}

export { isTerminal };
