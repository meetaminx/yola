"use client";

import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState, type FormEvent } from "react";
import { panelSwap, transition } from "@/components/motion/tokens";
import { Button } from "@/components/ui/button";
import { EnvironmentBadge, StatusBadge } from "@/components/ui/status-badge";
import { parseZec } from "@/lib/payments/amount";
import { PaymentDetails } from "./payment-details";
import { PaymentTimeline } from "./payment-timeline";
import { SimulatorControls } from "./simulator-controls";
import { DEMO_ADAPTER, TESTNET_ADAPTER_UNCONFIGURED, type CapabilityName } from "@/lib/zcash/adapter";
import { cancelDemo, createDemoPaymentRequest, runSimulation, type SimulateAction } from "@/lib/payments/demo-adapter";
import { expireIfDue } from "@/lib/payments/lifecycle";
import { isTerminal } from "@/lib/payments/state-machine";
import type { PaymentRequest } from "@/lib/payments/types";
import { cn } from "@/lib/utils/cn";

type DemoNetwork = "demo" | "testnet";

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
      setPayment((p) => (p ? expireIfDue(p, new Date(n)) : p));
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

              <PaymentDetails payment={payment} now={now} />

              <SimulatorControls
                payment={payment}
                onAction={(action: SimulateAction) => act((p) => runSimulation(p, action))}
                onCancel={() => act((p) => cancelDemo(p))}
                onReset={() => setPayment(null)}
              />
              {actionError && (
                <p role="alert" className="text-[13px] text-danger">
                  {actionError}
                </p>
              )}

              <PaymentTimeline history={payment.history} trustLevel={payment.trust_level} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
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
