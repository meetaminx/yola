"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, type KeyboardEvent } from "react";
import { panelSwap, transition } from "@/components/motion/tokens";
import { CodeBlock } from "@/components/ui/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import { SNIPPET_CREATE, SNIPPET_QR, SNIPPET_STATUS, SNIPPET_WEBHOOK } from "@/lib/content/snippets";
import { cn } from "@/lib/utils/cn";

const TABS = [
  { id: "create", label: "Create payment", file: "server/checkout.ts", code: SNIPPET_CREATE, note: "One call on your server. The idempotency key makes retries safe." },
  { id: "qr", label: "Generate QR", file: "checkout/qr.ts", code: SNIPPET_QR, note: "The QR is always built from the payment record, never from form state." },
  { id: "status", label: "Display status", file: "app/api/orders/[id]/status/route.ts", code: SNIPPET_STATUS, note: "Poll through your own route; stop when the status is final." },
  { id: "webhook", label: "Handle webhooks", file: "app/api/webhooks/yola/route.ts", code: SNIPPET_WEBHOOK, note: "Verify the HMAC signature and timestamp, then de-duplicate by event ID." },
] as const;

export function IntegrationTabs() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const tab = TABS[active];

  function onKey(e: KeyboardEvent) {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (active + dir + TABS.length) % TABS.length;
    setActive(next);
    refs.current[next]?.focus();
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-panel)] border border-line bg-[#0b0c11]">
      <div className="flex items-center justify-between gap-2 border-b border-line pr-2">
        <div role="tablist" aria-label="Integration steps" className="flex overflow-x-auto" onKeyDown={onKey}>
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              id={`int-tab-${t.id}`}
              aria-selected={i === active}
              aria-controls="int-panel"
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              className={cn(
                "relative h-12 shrink-0 px-4 text-[13px] transition-colors",
                i === active ? "text-text" : "text-muted hover:text-text",
              )}
            >
              {t.label}
              {i === active && (
                <motion.span layoutId="int-underline" transition={transition.statusChange} className="absolute inset-x-3 -bottom-px h-px bg-brand-soft" />
              )}
            </button>
          ))}
        </div>
        <CopyButton value={tab.code} label={`${tab.label} code`} className="shrink-0" />
      </div>
      <div id="int-panel" role="tabpanel" aria-labelledby={`int-tab-${tab.id}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab.id} {...panelSwap}>
            <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-2">
              <span className="truncate font-mono text-xs text-muted">{tab.file}</span>
              <span className="hidden text-xs text-faint sm:block">{tab.note}</span>
            </div>
            <CodeBlock bare code={tab.code} className="rounded-none border-0" />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
