"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { transition } from "@/components/motion/tokens";
import { cn } from "@/lib/utils/cn";

interface CopyButtonProps {
  value: string;
  /** What is being copied, for screen readers, e.g. "payment payload". */
  label: string;
  className?: string;
  showText?: boolean;
}

export function CopyButton({ value, label, className, showText = true }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  }

  const text = state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy";

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted transition-colors duration-[var(--dur-quick)] hover:bg-white/[0.06] hover:text-text",
        state === "copied" && "text-signal hover:text-signal",
        state === "failed" && "text-danger hover:text-danger",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={state === "copied" ? "check" : "copy"}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={transition.press}
          className="inline-flex"
        >
          {state === "copied" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </motion.span>
      </AnimatePresence>
      {showText && <span>{text}</span>}
      <span className="sr-only" role="status" aria-live="polite">
        {state === "copied" ? `${label} copied to clipboard` : state === "failed" ? "Copy failed" : ""}
      </span>
    </button>
  );
}
