"use client";

import { AnimatePresence, motion } from "motion/react";
import { transition } from "@/components/motion/tokens";
import { STATUS_COPY } from "@/lib/payments/state-machine";
import type { EvidenceKind, StatusEvent, TrustLevel } from "@/lib/payments/types";
import { cn } from "@/lib/utils/cn";

const EVIDENCE_LABEL: Record<EvidenceKind, { simulated: string; real: string }> = {
  request_created: { simulated: "Request stored", real: "Request stored" },
  merchant_action: { simulated: "Merchant action", real: "Merchant action" },
  observation: { simulated: "Simulated observation", real: "Output observed" },
  confirmation_depth: { simulated: "Simulated block", real: "Block depth" },
  clock: { simulated: "Deadline passed", real: "Deadline passed" },
  reorg: { simulated: "Simulated reorg", real: "Chain reorganisation" },
  operator: { simulated: "Operator review", real: "Operator review" },
};

export function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function PaymentTimeline({
  history,
  trustLevel,
  className,
}: {
  history: StatusEvent[];
  trustLevel: TrustLevel;
  className?: string;
}) {
  const simulated = trustLevel === "simulated";
  return (
    <div className={className}>
      <h4 className="mb-3 text-sm text-text">Status timeline</h4>
      <ol className="relative ml-1.5 border-l border-line-strong">
        <AnimatePresence initial={false}>
          {history.map((h, i) => {
            const latest = i === history.length - 1;
            return (
              <motion.li
                key={`${h.status}-${i}`}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={transition.reveal}
                className="relative pb-3 pl-5 last:pb-0"
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1.5 -left-[5px] size-[9px] rounded-full border-2 border-[#0d0e14]",
                    latest ? (h.status === "confirmed" ? "bg-signal" : "bg-brand-soft") : "bg-line-strong",
                  )}
                />
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className={cn("text-sm", latest ? "text-text" : "text-muted")}>{STATUS_COPY[h.status].label}</span>
                  <span className="font-mono text-[11.5px] text-faint">{timeOf(h.at)}</span>
                  <span className="text-xs text-faint">
                    {h.note ?? EVIDENCE_LABEL[h.evidence][simulated ? "simulated" : "real"]}
                  </span>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </div>
  );
}
