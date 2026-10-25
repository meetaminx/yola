"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";
import { ease } from "@/components/motion/tokens";

const STEPS = [
  {
    title: "Create a payment request",
    body: "Your server sends the amount and an order reference. Yola returns a request with a one-time receiving address and an expiry.",
  },
  {
    title: "Show the payment instructions",
    body: "Display the QR code and ZIP 321 link. Any Zcash wallet that supports payment URIs can scan or open it.",
  },
  {
    title: "Verify the transaction",
    body: "Yola watches for outputs to that address, checks the amount, and waits for the confirmation depth you configured.",
  },
  {
    title: "Notify your application",
    body: "When the status changes, Yola sends a signed webhook. Fulfil the order only on a verified confirmation.",
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLOListElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });

  return (
    <ol ref={ref} className="relative grid gap-10 md:grid-cols-4 md:gap-6">
      {/* The rail draws once when the section is reached. Text never waits for it. */}
      <div aria-hidden className="absolute top-[15px] right-0 left-0 hidden h-px bg-line md:block">
        <motion.div
          className="h-full origin-left bg-gradient-to-r from-brand-deep via-brand to-brand-soft"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: inView ? 1 : 0 }}
          transition={{ duration: 1.2, ease: ease.inOut }}
        />
      </div>
      <div aria-hidden className="absolute top-0 bottom-0 left-[15px] w-px bg-line md:hidden" />
      {STEPS.map((s, i) => (
        <li key={s.title} className="relative pl-12 md:pl-0">
          <motion.span
            className="absolute top-0 left-0 flex size-[31px] items-center justify-center rounded-full border bg-bg font-mono text-xs md:relative"
            initial={false}
            animate={{
              borderColor: inView ? "rgb(139 92 246 / 0.7)" : "rgb(248 250 252 / 0.14)",
              color: inView ? "#C4B5FD" : "#9298A8",
            }}
            transition={{ delay: inView ? 0.15 + i * 0.28 : 0, duration: 0.3 }}
          >
            {i + 1}
          </motion.span>
          <h3 className="type-heading text-lg md:mt-6">{s.title}</h3>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}
