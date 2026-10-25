import { STATUS_COPY } from "@/lib/payments/state-machine";
import type { PaymentStatus } from "@/lib/payments/types";
import { cn } from "@/lib/utils/cn";

const TONE: Record<PaymentStatus, string> = {
  created: "text-muted bg-white/[0.04] [--dot:var(--text-muted)]",
  awaiting_payment: "text-brand-soft bg-brand/10 [--dot:var(--brand)]",
  payment_detected: "text-brand-soft bg-brand/15 [--dot:var(--brand-soft)]",
  confirming: "text-warning bg-warning/10 [--dot:var(--warning)]",
  confirmed: "text-success bg-success/10 [--dot:var(--success)]",
  expired: "text-muted bg-white/[0.04] [--dot:var(--text-faint)]",
  cancelled: "text-muted bg-white/[0.04] [--dot:var(--text-faint)]",
  failed: "text-danger bg-danger/10 [--dot:var(--danger)]",
  underpaid: "text-warning bg-warning/10 [--dot:var(--warning)]",
  overpaid: "text-warning bg-warning/10 [--dot:var(--warning)]",
  verification_required: "text-danger bg-danger/10 [--dot:var(--danger)]",
};

export function StatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium",
        TONE[status],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-[var(--dot)]" />
      {STATUS_COPY[status].label}
    </span>
  );
}

/** The environment label. Wording is fixed by the product spec so it is never ambiguous. */
export function EnvironmentBadge({ env }: { env: "simulated" | "testnet" }) {
  return env === "simulated" ? (
    <span className="inline-flex items-center gap-2 rounded-md border border-brand/30 bg-brand/[0.08] px-2 py-1 font-mono text-[10.5px] font-medium tracking-wide text-brand-soft">
      <span aria-hidden className="size-1.5 rounded-full bg-brand-soft" />
      SIMULATED — NO BLOCKCHAIN TRANSACTION
    </span>
  ) : (
    <span className="inline-flex items-center gap-2 rounded-md border border-warning/30 bg-warning/[0.08] px-2 py-1 font-mono text-[10.5px] font-medium tracking-wide text-warning">
      <span aria-hidden className="size-1.5 rounded-full bg-warning" />
      ZCASH TESTNET — TEST FUNDS HAVE NO MONETARY VALUE
    </span>
  );
}
