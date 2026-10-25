"use client";

import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Info, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { panelSwap, transition } from "@/components/motion/tokens";
import { PaymentQr } from "@/components/qr/payment-qr";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { EnvironmentBadge, StatusBadge } from "@/components/ui/status-badge";
import { formatZecTrimmed, parseZec } from "@/lib/payments/amount";
import { DEMO_ADAPTER, TESTNET_ADAPTER_UNCONFIGURED, type CapabilityName } from "@/lib/zcash/adapter";
import {
  cancelDemo,
  createDemoPaymentRequest,
  simulateConfirmation,
  simulateExpiry,
  simulateIncomingPayment,
  simulateReorg,
} from "@/lib/payments/demo-adapter";
import { isTerminal, STATUS_COPY } from "@/lib/payments/state-machine";
import type { EvidenceKind, PaymentRequest } from "@/lib/payments/types";
import { cn } from "@/lib/utils/cn";

type DemoNetwork = "demo" | "testnet";

const EVIDENCE_LABEL: Record<EvidenceKind, string> = {
  request_created: "Request stored",
  merchant_action: "Merchant action",
  observation: "Simulated observation",
  confirmation_depth: "Simulated block",
  clock: "Deadline passed",
  reorg: "Simulated reorg",
  operator: "Operator review",
};

function formatRemaining(ms: number) {
  if (ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function LiveDemo() {
  const ids = { amount: useId(), desc: useId(), amountErr: useId() };
  const [amount, setAmount] = useState("0.25");
  const [description, setDescription] = useState("Ceramic pour-over set");
  const [network, setNetwork] = useState<DemoNetwork>("demo");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentRequest | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const live = payment !== null && !isTerminal(payment.status);
  // Set when a request is created and then every second; never read during prerender.
  const [now, setNow] = useState(0);

  // A real clock drives expiry, and expiry still goes through the state machine.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setPayment((p) =>
        p && n >= Date.parse(p.expires_at) && (p.status === "awaiting_payment" || p.status === "underpaid")
          ? simulateExpiry(p)
          : p,
      );
    }, 1000);
    return () => clearInterval(t);
  }, [live]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (network !== "demo") return;
    const parsed = parseZec(amount);
    if (!parsed.ok) {
      setAmountError(parsed.message);
      return;
    }
    setAmountError(null);
    setActionError(null);
    setNow(Date.now());
    setPayment(createDemoPaymentRequest({ amountZatoshis: parsed.zatoshis, description }));
  }

  function act(fn: (p: PaymentRequest) => PaymentRequest) {
    if (!payment) return;
    try {
      setPayment(fn(payment));
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "That action is not available right now.");
    }
  }

  const requested = payment ? BigInt(payment.amount_zatoshis) : 0n;
  const received = payment?.amount_received_zatoshis ? BigInt(payment.amount_received_zatoshis) : 0n;

  return (
    <div className="grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* ── Request form ───────────────────────────── */}
      <form onSubmit={submit} noValidate className="flex flex-col gap-6 bg-surface p-6 md:p-8">
        <div>
          <h3 className="type-heading text-xl">Create a payment request</h3>
          <p className="mt-1.5 text-sm text-muted">Runs in your browser with the simulator. Nothing is sent anywhere.</p>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm text-text">Environment</legend>
          <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-line bg-bg p-1">
            {(
              [
                ["demo", "Simulator"],
                ["testnet", "Zcash testnet"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={cn(
                  "relative flex h-9 cursor-pointer items-center justify-center rounded-[7px] text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                  network === value ? "text-text" : "text-muted hover:text-text",
                )}
              >
                {network === value && (
                  <motion.span
                    layoutId="env-pill"
                    transition={transition.statusChange}
                    className="absolute inset-0 rounded-[7px] border border-line-strong bg-surface-raised"
                  />
                )}
                <input
                  type="radio"
                  name="network"
                  value={value}
                  checked={network === value}
                  onChange={() => setNetwork(value)}
                  className="sr-only"
                />
                <span className="relative">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor={ids.amount} className="mb-2 block text-sm text-text">
            Amount
          </label>
          <div
            className={cn(
              "flex h-11 items-center rounded-[var(--radius-control)] border bg-bg pr-3 transition-colors focus-within:border-brand",
              amountError ? "border-danger" : "border-line-strong",
            )}
          >
            <input
              id={ids.amount}
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (amountError) setAmountError(null);
              }}
              aria-invalid={amountError ? true : undefined}
              aria-describedby={amountError ? ids.amountErr : undefined}
              className="h-full min-w-0 flex-1 bg-transparent px-3 font-mono text-[15px] text-text outline-none"
            />
            <span className="font-mono text-sm text-muted">{network === "testnet" ? "TAZ" : "ZEC"}</span>
          </div>
          <AnimatePresence initial={false}>
            {amountError && (
              <motion.p
                id={ids.amountErr}
                role="alert"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: [-4, 3, -2, 0] }}
                exit={{ opacity: 0 }}
                transition={transition.reveal}
                className="mt-2 text-[13px] text-danger"
              >
                {amountError}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div>
          <label htmlFor={ids.desc} className="mb-2 block text-sm text-text">
            Description <span className="text-muted">(shown to the customer)</span>
          </label>
          <input
            id={ids.desc}
            maxLength={120}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="h-11 w-full rounded-[var(--radius-control)] border border-line-strong bg-bg px-3 text-[15px] text-text outline-none transition-colors focus:border-brand"
          />
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {network === "testnet" ? (
            <motion.div key="testnet" {...panelSwap} className="rounded-xl border border-warning/25 bg-warning/[0.06] p-4">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                <div className="text-[13px] leading-relaxed text-text/90">
                  <p className="font-medium text-text">Testnet is not connected here.</p>
                  <p className="mt-1 text-muted">
                    A real testnet payment needs a wallet holding test funds (TAZ) and a Yola backend running a
                    Zebra node, a Zaino indexer and a view-only scanner. This page has none of those, so it will not
                    pretend to verify anything.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => setNetwork("demo")}
                      className="text-brand-soft underline-offset-4 hover:underline"
                    >
                      Use the simulator
                    </button>
                    <Link href="/docs/testnet" className="text-brand-soft underline-offset-4 hover:underline">
                      Testnet setup guide
                    </Link>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="demo" {...panelSwap}>
              <Button type="submit" size="lg" className="w-full">
                {payment ? "Create a new request" : "Create payment request"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <CapabilityList network={network} />
      </form>

      {/* ── Result ─────────────────────────────────── */}
      <div className="relative min-h-[520px] bg-[#0d0e14] p-6 md:p-8" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {!payment ? (
            <motion.div key="empty" {...panelSwap} className="flex h-full min-h-[456px] flex-col items-center justify-center text-center">
              <div className="grid size-28 grid-cols-5 gap-1 rounded-xl border border-dashed border-line-strong p-3 opacity-60" aria-hidden>
                {Array.from({ length: 25 }).map((_, i) => (
                  <span key={i} className={cn("rounded-[2px]", [0, 1, 5, 6, 3, 4, 8, 9, 15, 16, 20, 21, 12, 18, 23].includes(i) ? "bg-line-strong" : "")} />
                ))}
              </div>
              <p className="mt-5 text-sm text-text">Your request will appear here</p>
              <p className="mt-1 max-w-xs text-[13px] text-muted">
                With its QR code, payload and a status timeline you can drive with the simulator.
              </p>
            </motion.div>
          ) : (
            <motion.div key={payment.id} {...panelSwap} className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <EnvironmentBadge env="simulated" />
                <motion.div key={payment.status} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={transition.statusChange}>
                  <StatusBadge status={payment.status} />
                </motion.div>
              </div>

              <div className="grid gap-6 sm:grid-cols-[220px_minmax(0,1fr)]">
                <PaymentQr payload={payment.qr_payload} paymentId={payment.id} />
                <dl className="grid content-start gap-3 text-sm">
                  <div>
                    <dt className="text-muted">Amount</dt>
                    <dd className="type-heading mt-0.5 text-3xl">
                      {formatZecTrimmed(requested)} <span className="text-lg text-muted">ZEC</span>
                    </dd>
                    {received > 0n && (
                      <dd className="mt-1 font-mono text-xs text-muted">
                        received {formatZecTrimmed(received)} ZEC (simulated)
                      </dd>
                    )}
                  </div>
                  {payment.description && (
                    <div>
                      <dt className="text-muted">Description</dt>
                      <dd className="mt-0.5 text-text">{payment.description}</dd>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-muted">Request ID</dt>
                      <dd className="mt-0.5 truncate font-mono text-[13px] text-text">{payment.id}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">{live ? "Expires in" : "Expiry"}</dt>
                      <dd className="mt-0.5 font-mono text-[13px] tabular-nums text-text">
                        {live ? formatRemaining(Date.parse(payment.expires_at) - now) : timeOf(payment.expires_at)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Destination</dt>
                      <dd className="mt-0.5 font-mono text-[13px] text-text">none (simulated)</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Confirmations</dt>
                      <dd className="mt-0.5 font-mono text-[13px] tabular-nums text-text">
                        {payment.confirmations
                          ? `${payment.confirmations.observed} / ${payment.confirmations.required}`
                          : "—"}
                      </dd>
                    </div>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl border border-line bg-bg">
                <div className="flex items-center justify-between border-b border-line py-1 pr-1 pl-3">
                  <span className="text-xs text-muted">QR payload</span>
                  <CopyButton value={payment.qr_payload} label="payment payload" />
                </div>
                <p className="break-all px-3 py-2.5 font-mono text-[12.5px] text-text/85">{payment.qr_payload}</p>
                <p className="flex gap-2 border-t border-line px-3 py-2 text-xs text-muted">
                  <Info className="mt-px size-3.5 shrink-0" />
                  Simulator payloads use a yola-demo: scheme on purpose, so no wallet mistakes them for a real
                  zcash: payment request.
                </p>
              </div>

              <Simulator payment={payment} onAct={act} onReset={() => setPayment(null)} />
              {actionError && (
                <p role="alert" className="text-[13px] text-danger">
                  {actionError}
                </p>
              )}

              <Timeline payment={payment} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Simulator({
  payment,
  onAct,
  onReset,
}: {
  payment: PaymentRequest;
  onAct: (fn: (p: PaymentRequest) => PaymentRequest) => void;
  onReset: () => void;
}) {
  const requested = BigInt(payment.amount_zatoshis);
  const s = payment.status;
  type Action = { label: string; fn: (p: PaymentRequest) => PaymentRequest; primary?: boolean };
  let actions: Action[] = [];

  if (s === "awaiting_payment") {
    actions = [
      { label: "Send the exact amount", fn: (p) => simulateIncomingPayment(p), primary: true },
      { label: "Send half", fn: (p) => simulateIncomingPayment(p, requested / 2n) },
      { label: "Send 20% extra", fn: (p) => simulateIncomingPayment(p, (requested * 6n) / 5n) },
      { label: "Let it expire", fn: (p) => simulateExpiry(p) },
      { label: "Cancel", fn: (p) => cancelDemo(p) },
    ];
  } else if (s === "underpaid") {
    actions = [
      { label: "Send the difference", fn: (p) => simulateIncomingPayment(p), primary: true },
      { label: "Let it expire", fn: (p) => simulateExpiry(p) },
    ];
  } else if (s === "payment_detected") {
    actions = [{ label: "Mine a block", fn: (p) => simulateConfirmation(p), primary: true }];
  } else if (s === "confirming") {
    actions = [
      { label: "Mine a block", fn: (p) => simulateConfirmation(p), primary: true },
      { label: "Simulate a reorg", fn: (p) => simulateReorg(p) },
    ];
  }

  return (
    <div>
      <p className="mb-2 text-xs text-muted">
        {isTerminal(s) ? STATUS_COPY[s].detail : `Simulator controls — ${STATUS_COPY[s].detail}`}
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button key={a.label} variant={a.primary ? "primary" : "secondary"} size="sm" onClick={() => onAct(a.fn)}>
            {a.label}
          </Button>
        ))}
        {isTerminal(s) && (
          <Button variant="secondary" size="sm" onClick={onReset}>
            <RotateCcw className="size-3.5" /> Start over
          </Button>
        )}
      </div>
    </div>
  );
}

function Timeline({ payment }: { payment: PaymentRequest }) {
  return (
    <div>
      <h4 className="mb-3 text-sm text-text">Status timeline</h4>
      <ol className="relative ml-1.5 border-l border-line-strong">
        <AnimatePresence initial={false}>
          {payment.history.map((h, i) => {
            const latest = i === payment.history.length - 1;
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
                  <span className="text-xs text-faint">{h.note ?? EVIDENCE_LABEL[h.evidence]}</span>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </div>
  );
}

const SHOWN_CAPABILITIES: [CapabilityName, string][] = [
  ["shieldedPaymentDetection", "Shielded payment detection"],
  ["amountVerification", "Amount verification"],
  ["confirmationTracking", "Confirmation tracking"],
  ["reorgHandling", "Reorg handling"],
];

/** Reads the adapter's declared capabilities, so the UI can never overstate what is verified. */
function CapabilityList({ network }: { network: DemoNetwork }) {
  const adapter = network === "demo" ? DEMO_ADAPTER : TESTNET_ADAPTER_UNCONFIGURED;
  const label = { simulated: "Simulated", not_configured: "Not configured", supported: "Supported", unsupported: "Unsupported" };
  return (
    <div className="mt-auto border-t border-line pt-5">
      <p className="text-sm text-text">What this environment can prove</p>
      <ul className="mt-3 space-y-2 text-[13px]">
        {SHOWN_CAPABILITIES.map(([key, name]) => {
          const support = adapter.capabilities[key];
          return (
            <li key={key} className="flex items-center justify-between gap-3">
              <span className="text-muted">{name}</span>
              <span className={cn("font-mono text-xs", support === "supported" ? "text-success" : support === "simulated" ? "text-brand-soft" : "text-faint")}>
                {label[support]}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-faint">{adapter.limitations[0]}</p>
    </div>
  );
}
