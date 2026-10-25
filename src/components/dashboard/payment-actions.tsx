"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { cancelPaymentAction, simulatePaymentAction } from "@/app/dashboard/actions";
import { PaymentDetails } from "@/components/payments/payment-details";
import { PaymentTimeline } from "@/components/payments/payment-timeline";
import { SimulatorControls } from "@/components/payments/simulator-controls";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { isTerminal } from "@/lib/payments/state-machine";
import type { PaymentRequest } from "@/lib/payments/types";

/** Client half of the payment detail page: QR, live countdown, simulator and cancel. */
export function PaymentDetailClient({ projectId, payment }: { projectId: string; payment: PaymentRequest }) {
  const [now, setNow] = useState(0);
  const [pending, start] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (isTerminal(payment.status)) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [payment.status]);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    start(async () => {
      const r = await fn();
      if (!r.ok) toast({ tone: "error", message: r.error ?? "That did not work." });
      else if (success) toast({ tone: "success", message: success });
      router.refresh();
    });
  }

  const cancellable = payment.status === "awaiting_payment" || payment.status === "created";

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <PaymentDetails payment={payment} now={now} />
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        {payment.trust_level === "simulated" && (
          <SimulatorControls payment={payment} busy={pending} onAction={(a) => run(() => simulatePaymentAction(projectId, payment.id, a))} />
        )}
        {cancellable && (
          <div>
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => setConfirmCancel(true)}>
              Cancel payment request
            </Button>
          </div>
        )}
        <PaymentTimeline history={payment.history} trustLevel={payment.trust_level} />
      </div>
      <Dialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this payment request?"
        description="The customer will see it as cancelled. A payment that arrives afterwards will be flagged for review, not confirmed."
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConfirmCancel(false)}>
            Keep it
          </Button>
          <Button
            size="sm"
            loading={pending}
            onClick={() => {
              setConfirmCancel(false);
              run(() => cancelPaymentAction(projectId, payment.id), "Payment request cancelled");
            }}
          >
            Cancel request
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
