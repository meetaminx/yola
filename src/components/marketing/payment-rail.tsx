"use client";

import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { Check, KeyRound, Pause, Play, QrCode, Send, Store } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { panelSwap, transition } from "@/components/motion/tokens";
import { cn } from "@/lib/utils/cn";

/**
 * Hero visualization: the payment rail.
 * An illustration of the product workflow. It never shows a real
 * transaction, and says so.
 */

interface Station {
  key: string;
  title: string;
  caption: string;
  icon: ReactNode;
  detail: ReactNode;
}

function Masked({ w }: { w: string }) {
  return <span className={cn("masked inline-block h-[1em] align-middle", w)} aria-label="hidden on chain" />;
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-muted">{k}</span>
      <span className="text-right text-text">{children}</span>
    </div>
  );
}

const STATIONS: Station[] = [
  {
    key: "merchant",
    title: "Your app",
    caption: "Asks Yola for a payment",
    icon: <Store className="size-4" />,
    detail: (
      <>
        <p className="mb-3 font-sans text-sm text-muted">Your server creates a request with one API call.</p>
        <div className="text-brand-soft">POST /api/v1/payment-requests</div>
        <div className="mt-1 text-text/80">{`{ "amount": "0.25", "currency": "ZEC", "network": "testnet" }`}</div>
      </>
    ),
  },
  {
    key: "request",
    title: "Payment request",
    caption: "A fresh address for this order",
    icon: <QrCode className="size-4" />,
    detail: (
      <>
        <p className="mb-3 font-sans text-sm text-muted">
          Yola derives a one-time shielded address from your viewing key, so the payment can be matched to this
          order alone.
        </p>
        <Row k="id">pay_8f2k…</Row>
        <Row k="address">utest1… (unique to this request)</Row>
        <Row k="uri">zcash:utest1…?amount=0.25</Row>
      </>
    ),
  },
  {
    key: "customer",
    title: "Customer pays",
    caption: "From any Zcash wallet",
    icon: <Send className="size-4" />,
    detail: (
      <>
        <p className="mb-3 font-sans text-sm text-muted">
          A shielded payment is encrypted on chain. An outside observer cannot read it.
        </p>
        <Row k="amount">
          <Masked w="w-20" />
        </Row>
        <Row k="recipient">
          <Masked w="w-32" />
        </Row>
        <Row k="memo">
          <Masked w="w-24" />
        </Row>
      </>
    ),
  },
  {
    key: "verify",
    title: "Verification",
    caption: "Your viewing key reads it",
    icon: <KeyRound className="size-4" />,
    detail: (
      <>
        <p className="mb-3 font-sans text-sm text-muted">
          Using only your incoming viewing key (it cannot spend), Yola decrypts outputs sent to your addresses and
          checks them against the request.
        </p>
        <Row k="amount">0.25 ZEC · matches</Row>
        <Row k="recipient">this request’s address · matches</Row>
        <Row k="confirmations">waiting for your policy</Row>
      </>
    ),
  },
  {
    key: "confirmed",
    title: "Confirmed",
    caption: "Your app is notified",
    icon: <Check className="size-4" />,
    detail: (
      <>
        <p className="mb-3 font-sans text-sm text-muted">
          Only after the confirmation policy is met does the status change. Then Yola sends a signed webhook.
        </p>
        <div className="text-signal">payment_request.confirmed</div>
        <div className="mt-1 text-text/80">Yola-Signature: t=…,v1=…</div>
      </>
    ),
  },
];

export function PaymentRail() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = STATIONS.length - 1;

  // One orchestrated traversal when the rail first comes into view.
  useEffect(() => {
    if (!inView || reduce) return;
    const t = setTimeout(() => setPlaying(true), 250);
    return () => clearTimeout(t);
  }, [inView, reduce]);

  const isPlaying = playing && active < last;

  useEffect(() => {
    if (!isPlaying) return;
    const t = setTimeout(() => setActive((a) => Math.min(a + 1, last)), 1500);
    return () => clearTimeout(t);
  }, [isPlaying, active, last]);

  function select(i: number) {
    setPlaying(false);
    setActive(i);
  }

  function togglePlay() {
    if (isPlaying) return setPlaying(false);
    if (active >= last) setActive(0);
    setPlaying(true);
  }

  const progress = active / last;

  return (
    <div ref={ref} className="panel relative overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <p className="min-w-0 flex-1 text-[13px] text-muted">
          <span className="text-text">How a payment moves through Yola.</span> An illustration, not a live
          transaction.
        </p>
        <button
          type="button"
          onClick={togglePlay}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-2.5 text-xs text-text transition-colors hover:border-brand-soft/40"
        >
          {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
          {isPlaying ? "Pause" : active >= last ? "Replay" : "Play"}
        </button>
      </div>

      {/* Stations */}
      <div className="px-5 pt-8 pb-6 md:px-8">
       <div className="relative">
        {/* Rail (desktop: horizontal). Positioned in the same box as the station grid so nodes and pulse align. */}
        <div aria-hidden className="absolute top-6 right-[10%] left-[10%] hidden h-px bg-line-strong md:block">
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-brand-deep via-brand to-brand-soft"
            initial={false}
            animate={{ width: `${progress * 100}%` }}
            transition={transition.journey}
          />
          <motion.div
            className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-soft shadow-[0_0_12px_4px_rgb(139_92_246/0.55)]"
            initial={false}
            animate={{ left: `${progress * 100}%` }}
            transition={transition.journey}
          />
        </div>
        {/* Rail (mobile: vertical) */}
        <div aria-hidden className="absolute top-6 bottom-6 left-[24px] w-px bg-line-strong md:hidden">
          <motion.div
            className="absolute inset-x-0 top-0 bg-gradient-to-b from-brand-deep via-brand to-brand-soft"
            initial={false}
            animate={{ height: `${progress * 100}%` }}
            transition={transition.journey}
          />
        </div>

        <ol role="tablist" aria-label="Payment workflow steps" className="relative grid gap-4 md:grid-cols-5 md:gap-2">
          {STATIONS.map((s, i) => {
            const reached = i <= active;
            const current = i === active;
            const isFinal = i === last;
            return (
              <li key={s.key} role="presentation">
                <button
                  type="button"
                  role="tab"
                  id={`rail-tab-${s.key}`}
                  aria-selected={current}
                  aria-controls="rail-panel"
                  onClick={() => select(i)}
                  className="group flex w-full items-center gap-4 rounded-xl p-1 text-left md:flex-col md:gap-3 md:text-center"
                >
                  <motion.span
                    initial={false}
                    animate={{ scale: current ? 1.06 : 1 }}
                    transition={transition.statusChange}
                    className={cn(
                      "relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors duration-[var(--dur-base)]",
                      reached
                        ? isFinal && current
                          ? "border-signal/60 bg-[#1a1f10] text-signal"
                          : "border-brand/60 bg-[#1a1530] text-brand-soft"
                        : "border-line-strong bg-surface text-muted group-hover:text-text",
                    )}
                  >
                    {s.icon}
                  </motion.span>
                  <span>
                    <span
                      className={cn(
                        "block text-sm font-medium transition-colors",
                        current ? "text-text" : "text-muted group-hover:text-text",
                      )}
                    >
                      {s.title}
                    </span>
                    <span className="block text-xs text-faint">{s.caption}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
       </div>
      </div>

      {/* Inspector */}
      <div
        id="rail-panel"
        role="tabpanel"
        aria-labelledby={`rail-tab-${STATIONS[active].key}`}
        className="min-h-[188px] border-t border-line bg-[#0c0d12] px-5 py-5 font-mono text-[12.5px] leading-relaxed md:px-8"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={active} {...panelSwap}>
            {STATIONS[active].detail}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
