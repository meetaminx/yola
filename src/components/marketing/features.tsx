"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { panelSwap, transition } from "@/components/motion/tokens";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatZecFixed, parseZec } from "@/lib/payments/amount";
import { STATUS_COPY, TRANSITIONS } from "@/lib/payments/state-machine";
import type { EvidenceKind, PaymentStatus } from "@/lib/payments/types";
import { cn } from "@/lib/utils/cn";

/**
 * Three capabilities, three different shapes. Each mini-visual runs on the
 * same code the product uses: the exact amount parser, the status copy, and
 * the state machine's transition table.
 */
export function Features() {
  return (
    <div className="grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line md:grid-cols-3">
      <Feature
        title="Payment requests"
        body="Create structured ZEC payment requests through a consistent API."
        visual={<ExactAmount />}
      />
      <Feature
        title="Payment components"
        body="Give customers a clean, responsive payment experience."
        visual={<ComponentPreview />}
      />
      <Feature
        title="Transaction tracking"
        body="Monitor payment lifecycle events through a clear status interface."
        visual={<TransitionExplorer />}
      />
    </div>
  );
}

function Feature({ title, body, visual }: { title: string; body: string; visual: React.ReactNode }) {
  return (
    <article className="flex flex-col bg-surface">
      <div className="flex min-h-[248px] items-center justify-center border-b border-line bg-[#0d0e14] p-5">{visual}</div>
      <div className="p-6">
        <h3 className="type-heading text-lg">{title}</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">{body}</p>
      </div>
    </article>
  );
}

/* 1 — Type an amount, see the exact integer the API stores. */
function ExactAmount() {
  const [value, setValue] = useState("0.1");
  const parsed = parseZec(value);
  return (
    <div className="w-full max-w-[280px] font-mono text-[12.5px]">
      <label className="mb-1.5 block font-sans text-xs text-muted" htmlFor="feat-amount">
        Try an amount
      </label>
      <input
        id="feat-amount"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        className="h-9 w-full rounded-md border border-line-strong bg-bg px-2.5 text-text outline-none focus:border-brand"
      />
      <div className="mt-3 rounded-md border border-line bg-bg p-3 leading-relaxed">
        <span className="text-muted">{"{"}</span>
        <div className="pl-3">
          {parsed.ok ? (
            <>
              <div>
                <span className="text-text/85">&quot;amount&quot;</span>: <span className="text-signal/90">&quot;{formatZecFixed(parsed.zatoshis)}&quot;</span>,
              </div>
              <div>
                <span className="text-text/85">&quot;amount_zatoshis&quot;</span>:{" "}
                <span className="text-signal/90">&quot;{parsed.zatoshis.toString()}&quot;</span>
              </div>
            </>
          ) : (
            <div className="text-danger">
              <span className="text-text/85">&quot;error&quot;</span>: &quot;{parsed.code}&quot;
            </div>
          )}
        </div>
        <span className="text-muted">{"}"}</span>
      </div>
      <p className="mt-2 font-sans text-[11.5px] text-faint">Exact integers, never floating point.</p>
    </div>
  );
}

/* 2 — The customer-facing status block, cycling through real status copy. */
const PREVIEW: PaymentStatus[] = ["awaiting_payment", "payment_detected", "confirming", "confirmed", "underpaid"];

function ComponentPreview() {
  const [i, setI] = useState(0);
  const status = PREVIEW[i];
  return (
    <div className="w-full max-w-[280px]">
      <div className="rounded-xl border border-line-strong bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Order #1042</span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={status} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={transition.reveal}>
              <StatusBadge status={status} />
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="type-heading mt-3 text-2xl">
          0.25 <span className="text-base text-muted">ZEC</span>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={status} {...panelSwap} className="mt-1 min-h-[3.2em] text-xs leading-relaxed text-muted">
            {STATUS_COPY[status].detail}
          </motion.p>
        </AnimatePresence>
      </div>
      <div className="mt-3 flex justify-center gap-1.5" role="group" aria-label="Preview a status">
        {PREVIEW.map((s, idx) => (
          <button
            key={s}
            type="button"
            onClick={() => setI(idx)}
            aria-label={`Show ${STATUS_COPY[s].label}`}
            aria-pressed={idx === i}
            className={cn("h-1.5 rounded-full transition-all duration-[var(--dur-base)]", idx === i ? "w-6 bg-brand-soft" : "w-1.5 bg-line-strong hover:bg-muted")}
          />
        ))}
      </div>
    </div>
  );
}

/* 3 — Pick a status, see exactly which evidence can move it where. */
const EXPLORE: PaymentStatus[] = ["awaiting_payment", "payment_detected", "confirming", "expired"];
const EVIDENCE_SHORT: Record<EvidenceKind, string> = {
  request_created: "request stored",
  merchant_action: "merchant cancels",
  observation: "output observed",
  confirmation_depth: "block depth",
  clock: "deadline",
  reorg: "reorg",
  operator: "human review",
};

function TransitionExplorer() {
  const [from, setFrom] = useState<PaymentStatus>("payment_detected");
  const edges = Object.entries(TRANSITIONS[from]) as [PaymentStatus, readonly EvidenceKind[]][];
  return (
    <div className="w-full max-w-[280px] text-xs">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Choose a status">
        {EXPLORE.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFrom(s)}
            aria-pressed={from === s}
            className={cn(
              "rounded-full border px-2 py-1 transition-colors",
              from === s ? "border-brand/50 bg-brand/10 text-brand-soft" : "border-line text-muted hover:text-text",
            )}
          >
            {STATUS_COPY[s].label}
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.ul key={from} {...panelSwap} className="mt-3 space-y-1.5 font-mono text-[11.5px]">
          {edges.map(([to, ev]) => (
            <li key={to} className="flex items-center gap-2">
              <span className="text-faint">→</span>
              <span className="text-text">{STATUS_COPY[to].label}</span>
              <span className="ml-auto text-right text-muted">{ev.map((e) => EVIDENCE_SHORT[e]).join(" / ")}</span>
            </li>
          ))}
        </motion.ul>
      </AnimatePresence>
      <p className="mt-3 text-[11.5px] text-faint">Every move needs evidence. Anything else is rejected.</p>
    </div>
  );
}
