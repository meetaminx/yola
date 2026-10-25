import { describe, expect, it } from "vitest";
import { applyTransition, expireIfDue, isDue } from "@/lib/payments/lifecycle";
import type { PaymentRequest } from "@/lib/payments/types";
import { depthOf, reconcilePayment, type ChainObservation } from "@/lib/payments/verification";

const T0 = new Date("2026-10-25T12:00:00Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);
const TXA = "a".repeat(64);
const TXB = "b".repeat(64);

function testnetPayment(amount = 100_000n): PaymentRequest {
  const base: PaymentRequest = {
    id: "pay_testnet_x",
    amount: "0.00100000",
    amount_zatoshis: amount.toString(),
    currency: "ZEC",
    network: "testnet",
    trust_level: "verified_testnet",
    destination: "utest1example",
    description: null,
    external_reference: null,
    metadata: {},
    status: "created",
    created_at: T0.toISOString(),
    expires_at: at(900).toISOString(),
    payment_uri: "zcash:utest1example?amount=0.001",
    qr_payload: "zcash:utest1example?amount=0.001",
    status_url: "/api/v1/payment-requests/pay_testnet_x/status",
    confirmations: null,
    amount_received_zatoshis: null,
    transaction_id: null,
    updated_at: T0.toISOString(),
    history: [{ status: "created", at: T0.toISOString(), evidence: "request_created" }],
  };
  return applyTransition(base, "awaiting_payment", "request_created", T0);
}

const obs = (txid: string, value: bigint, height: number | null, seenAt = at(60)): ChainObservation => ({
  txid,
  valueZatoshis: value,
  height,
  firstSeenAt: seenAt,
});
const ctx = (tip: number, now = at(120), required = 3) => ({ tipHeight: tip, requiredConfirmations: required, now });

describe("depthOf", () => {
  it("is zero while anything is unmined and uses the shallowest output", () => {
    expect(depthOf([], 100)).toBe(0);
    expect(depthOf([obs(TXA, 1n, 100)], 100)).toBe(1);
    expect(depthOf([obs(TXA, 1n, 90), obs(TXB, 1n, 98)], 100)).toBe(3);
    expect(depthOf([obs(TXA, 1n, 90), obs(TXB, 1n, null)], 100)).toBe(0);
    expect(depthOf([obs(TXA, 1n, 101)], 100)).toBe(0);
  });
});

describe("reconcilePayment", () => {
  it("walks the happy path from mempool to confirmed only as evidence arrives", () => {
    let p = testnetPayment();
    expect(reconcilePayment(p, [], ctx(100))).toBe(p);

    p = reconcilePayment(p, [obs(TXA, 100_000n, null)], ctx(100));
    expect(p.status).toBe("payment_detected");
    expect(p.transaction_id).toBe(TXA);
    expect(p.confirmations).toEqual({ observed: 0, required: 3 });

    p = reconcilePayment(p, [obs(TXA, 100_000n, 101)], ctx(101));
    expect(p.status).toBe("confirming");
    expect(p.confirmations).toEqual({ observed: 1, required: 3 });

    const same = reconcilePayment(p, [obs(TXA, 100_000n, 101)], ctx(101));
    expect(same).toBe(p);

    p = reconcilePayment(p, [obs(TXA, 100_000n, 101)], ctx(102));
    expect(p.status).toBe("confirming");
    expect(p.confirmations?.observed).toBe(2);

    p = reconcilePayment(p, [obs(TXA, 100_000n, 101)], ctx(103));
    expect(p.status).toBe("confirmed");
    expect(p.history.map((h) => [h.status, h.evidence])).toEqual([
      ["created", "request_created"],
      ["awaiting_payment", "request_created"],
      ["payment_detected", "observation"],
      ["confirming", "confirmation_depth"],
      ["confirmed", "confirmation_depth"],
    ]);
  });

  it("jumps straight to confirmed when the scanner catches up on a deep payment", () => {
    const p = reconcilePayment(testnetPayment(), [obs(TXA, 100_000n, 90)], ctx(110));
    expect(p.status).toBe("confirmed");
    expect(p.history.map((h) => h.status)).toContain("confirming");
  });

  it("handles underpayment and a top-up across two transactions", () => {
    let p = reconcilePayment(testnetPayment(), [obs(TXA, 40_000n, null)], ctx(100));
    expect(p.status).toBe("underpaid");
    expect(p.amount_received_zatoshis).toBe("40000");

    // Mined but still short: stays underpaid.
    p = reconcilePayment(p, [obs(TXA, 40_000n, 101)], ctx(105));
    expect(p.status).toBe("underpaid");

    p = reconcilePayment(p, [obs(TXA, 40_000n, 101), obs(TXB, 60_000n, null, at(200))], ctx(105, at(220)));
    expect(p.status).toBe("payment_detected");
    expect(p.amount_received_zatoshis).toBe("100000");
    expect(p.transaction_id).toBe(TXA);

    p = reconcilePayment(p, [obs(TXA, 40_000n, 101), obs(TXB, 60_000n, 106)], ctx(108, at(400)));
    expect(p.status).toBe("confirmed");
  });

  it("marks overpayment only once confirmed", () => {
    let p = reconcilePayment(testnetPayment(), [obs(TXA, 150_000n, null)], ctx(100));
    expect(p.status).toBe("payment_detected");
    p = reconcilePayment(p, [obs(TXA, 150_000n, 100)], ctx(102));
    expect(p.status).toBe("overpaid");
  });

  it("walks back on a reorg before confirmation and recovers when re-mined", () => {
    let p = reconcilePayment(testnetPayment(), [obs(TXA, 100_000n, 101)], ctx(101));
    expect(p.status).toBe("confirming");
    // Back in the mempool after the reorg.
    p = reconcilePayment(p, [obs(TXA, 100_000n, null)], ctx(101));
    expect(p.status).toBe("payment_detected");
    expect(p.history.at(-1)?.evidence).toBe("reorg");
    // Gone entirely.
    p = reconcilePayment(p, [], ctx(101));
    expect(p.status).toBe("awaiting_payment");
    expect(p.amount_received_zatoshis).toBeNull();
    expect(p.transaction_id).toBeNull();
    // Re-mined.
    p = reconcilePayment(p, [obs(TXA, 100_000n, 102)], ctx(104));
    expect(p.status).toBe("confirmed");
  });

  it("resets an underpaid request whose partial payment vanished", () => {
    let p = reconcilePayment(testnetPayment(), [obs(TXA, 10_000n, null)], ctx(100));
    expect(p.status).toBe("underpaid");
    p = reconcilePayment(p, [], ctx(100));
    expect(p.status).toBe("awaiting_payment");
  });

  it("never silently undoes a confirmed payment: a deep reorg needs review", () => {
    const confirmed = reconcilePayment(testnetPayment(), [obs(TXA, 100_000n, 90)], ctx(110));
    expect(reconcilePayment(confirmed, [obs(TXA, 100_000n, 90)], ctx(200))).toBe(confirmed);
    const reviewed = reconcilePayment(confirmed, [], ctx(110));
    expect(reviewed.status).toBe("verification_required");
    expect(reviewed.history.at(-1)?.evidence).toBe("reorg");
  });

  it("flags late payments for review instead of confirming them", () => {
    // Seen after the deadline on a still-open request.
    const late = reconcilePayment(testnetPayment(), [obs(TXA, 100_000n, 120, at(1000))], ctx(130, at(1001)));
    expect(late.status).toBe("verification_required");
    expect(late.history.map((h) => h.status).slice(-2)).toEqual(["expired", "verification_required"]);

    // Arriving after the request expired or was cancelled.
    const expired = expireIfDue(testnetPayment(), at(1000), at(1000));
    expect(expired.status).toBe("expired");
    expect(reconcilePayment(expired, [], ctx(130))).toBe(expired);
    expect(reconcilePayment(expired, [obs(TXA, 100_000n, null, at(1100))], ctx(130, at(1100))).status).toBe("verification_required");
  });

  it("leaves operator-owned states alone", () => {
    const flagged = reconcilePayment(testnetPayment(), [obs(TXA, 1n, 1, at(1000))], ctx(130, at(1001)));
    expect(flagged.status).toBe("verification_required");
    expect(reconcilePayment(flagged, [obs(TXA, 100_000n, 1)], ctx(500))).toBe(flagged);
  });

  it("refuses simulated payments outright", () => {
    const demo = { ...testnetPayment(), network: "demo" as const, trust_level: "simulated" as const };
    expect(() => reconcilePayment(demo, [], ctx(1))).toThrow(/simulated/);
  });

  it("treats the confirmation policy as at least one block", () => {
    const p = reconcilePayment(testnetPayment(), [obs(TXA, 100_000n, 100)], ctx(100, at(100), 0));
    expect(p.status).toBe("confirmed");
  });
});

describe("expiry gated on observation", () => {
  it("does not expire a chain request until a pass began after the deadline", () => {
    const p = testnetPayment();
    expect(isDue(p, at(1000), null)).toBe(false);
    expect(isDue(p, at(1000), at(899))).toBe(false);
    expect(isDue(p, at(1000), at(900))).toBe(true);
    expect(isDue(p, at(899), at(899))).toBe(false);
  });
});
