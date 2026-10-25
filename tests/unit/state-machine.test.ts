import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, InvalidTransitionError, isTerminal } from "@/lib/payments/state-machine";

describe("payment state machine", () => {
  it("allows the happy path with the right evidence", () => {
    expect(canTransition("created", "awaiting_payment", "request_created")).toBe(true);
    expect(canTransition("awaiting_payment", "payment_detected", "observation")).toBe(true);
    expect(canTransition("payment_detected", "confirming", "confirmation_depth")).toBe(true);
    expect(canTransition("confirming", "confirmed", "confirmation_depth")).toBe(true);
  });

  it("never confirms on a clock or merchant action", () => {
    expect(canTransition("confirming", "confirmed", "clock")).toBe(false);
    expect(canTransition("confirming", "confirmed", "merchant_action")).toBe(false);
  });

  it("cannot skip from awaiting straight to confirmed", () => {
    expect(canTransition("awaiting_payment", "confirmed", "confirmation_depth")).toBe(false);
    expect(() => assertTransition("awaiting_payment", "confirmed", "observation")).toThrow(InvalidTransitionError);
  });

  it("flags late payments for review instead of confirming them", () => {
    expect(canTransition("expired", "verification_required", "observation")).toBe(true);
    expect(canTransition("expired", "payment_detected", "observation")).toBe(false);
  });

  it("handles reorgs", () => {
    expect(canTransition("confirming", "payment_detected", "reorg")).toBe(true);
    expect(canTransition("confirmed", "verification_required", "reorg")).toBe(true);
  });

  it("knows terminal states", () => {
    expect(isTerminal("confirmed")).toBe(true);
    expect(isTerminal("awaiting_payment")).toBe(false);
    expect(isTerminal("verification_required")).toBe(false);
  });
});
