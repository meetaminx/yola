import { describe, expect, it } from "vitest";
import {
  createDemoPaymentRequest,
  DEMO_REQUIRED_CONFIRMATIONS,
  simulateConfirmation,
  simulateExpiry,
  simulateIncomingPayment,
  simulateReorg,
} from "@/lib/payments/demo-adapter";
import { canConfirmRealPayments, DEMO_ADAPTER, TESTNET_ADAPTER_SCANNER, TESTNET_ADAPTER_UNCONFIGURED } from "@/lib/zcash/adapter";

const create = () => createDemoPaymentRequest({ amountZatoshis: 1_000_000n, description: "Test" });

describe("demo adapter", () => {
  it("creates a clearly simulated request", () => {
    const p = create();
    expect(p.status).toBe("awaiting_payment");
    expect(p.trust_level).toBe("simulated");
    expect(p.payment_uri).toBeNull();
    expect(p.qr_payload.startsWith("yola-demo:")).toBe(true);
    expect(p.qr_payload).not.toContain("zcash:");
    expect(p.amount).toBe("0.01000000");
  });

  it("runs the full simulated lifecycle through the real state machine", () => {
    let p = simulateIncomingPayment(create());
    expect(p.status).toBe("payment_detected");
    expect(p.transaction_id?.startsWith("sim_tx_")).toBe(true);
    for (let i = 0; i < DEMO_REQUIRED_CONFIRMATIONS; i++) p = simulateConfirmation(p);
    expect(p.status).toBe("confirmed");
    expect(p.history.map((h) => h.status)).toEqual([
      "created",
      "awaiting_payment",
      "payment_detected",
      "confirming",
      "confirmed",
    ]);
  });

  it("detects underpayment and accepts a top-up", () => {
    let p = simulateIncomingPayment(create(), 400_000n);
    expect(p.status).toBe("underpaid");
    p = simulateIncomingPayment(p, 600_000n);
    expect(p.status).toBe("payment_detected");
    expect(p.amount_received_zatoshis).toBe("1000000");
  });

  it("marks overpayment after confirmation", () => {
    let p = simulateIncomingPayment(create(), 2_000_000n);
    for (let i = 0; i < DEMO_REQUIRED_CONFIRMATIONS; i++) p = simulateConfirmation(p);
    expect(p.status).toBe("overpaid");
  });

  it("rolls back on a simulated reorg", () => {
    let p = simulateConfirmation(simulateIncomingPayment(create()));
    p = simulateReorg(p);
    expect(p.status).toBe("payment_detected");
    expect(p.confirmations).toBeNull();
  });

  it("expires and refuses to accept payment afterwards", () => {
    const p = simulateExpiry(create());
    expect(p.status).toBe("expired");
    expect(() => simulateIncomingPayment(p)).toThrow();
  });

  it("refuses to touch non-demo payments", () => {
    const p = { ...create(), network: "testnet" as const };
    expect(() => simulateIncomingPayment(p)).toThrow(/non-demo/);
  });

  it("adapters cannot confirm real payments without real capabilities", () => {
    expect(canConfirmRealPayments(DEMO_ADAPTER)).toBe(false);
    expect(canConfirmRealPayments(TESTNET_ADAPTER_UNCONFIGURED)).toBe(false);
    expect(canConfirmRealPayments(TESTNET_ADAPTER_SCANNER)).toBe(true);
  });
});
