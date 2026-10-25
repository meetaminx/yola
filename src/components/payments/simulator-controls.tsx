"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { availableSimulations, type SimulateAction } from "@/lib/payments/demo-adapter";
import { isTerminal, STATUS_COPY } from "@/lib/payments/state-machine";
import type { PaymentRequest } from "@/lib/payments/types";

export const SIMULATION_LABEL: Record<SimulateAction, string> = {
  pay: "Send the exact amount",
  pay_partial: "Send half",
  pay_extra: "Send 20% extra",
  mine_block: "Mine a block",
  reorg: "Simulate a reorg",
  expire: "Let it expire",
};

/**
 * Buttons that act as the customer's wallet and the network, for simulated
 * payments only. Renders nothing for any other trust level.
 */
export function SimulatorControls({
  payment,
  onAction,
  onCancel,
  onReset,
  resetLabel = "Start over",
  busy,
}: {
  payment: Pick<PaymentRequest, "status" | "trust_level">;
  onAction: (action: SimulateAction) => void;
  onCancel?: () => void;
  onReset?: () => void;
  resetLabel?: string;
  busy?: boolean;
}) {
  if (payment.trust_level !== "simulated") return null;
  const s = payment.status;
  const actions = availableSimulations(s);
  const primary: SimulateAction | undefined = actions.includes("pay") ? "pay" : actions.includes("mine_block") ? "mine_block" : undefined;
  const pay = s === "underpaid" ? "Send the difference" : SIMULATION_LABEL.pay;

  return (
    <div>
      <p className="mb-2 text-xs text-muted">
        {isTerminal(s) ? STATUS_COPY[s].detail : `Simulator: ${STATUS_COPY[s].detail}`}
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button key={a} variant={a === primary ? "primary" : "secondary"} size="sm" disabled={busy} onClick={() => onAction(a)}>
            {a === "pay" ? pay : SIMULATION_LABEL[a]}
          </Button>
        ))}
        {onCancel && (s === "awaiting_payment" || s === "created") && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
            Cancel request
          </Button>
        )}
        {onReset && isTerminal(s) && (
          <Button variant="secondary" size="sm" onClick={onReset}>
            <RotateCcw className="size-3.5" /> {resetLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
