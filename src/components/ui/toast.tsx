"use client";

import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, XCircle } from "lucide-react";
import { createContext, use, useCallback, useState, type ReactNode } from "react";
import { transition } from "@/components/motion/tokens";

type Toast = { id: number; tone: "success" | "error"; message: string };
const ToastContext = createContext<((t: Omit<Toast, "id">) => void) | null>(null);

/** Confirms a completed action ("Project saved") or reports a failure. Announced to screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { ...t, id }].slice(-3));
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.tone === "error" ? 6000 : 3500);
  }, []);

  return (
    <ToastContext value={push}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(360px,calc(100%-2rem))] flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4 }}
              transition={transition.reveal}
              className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-line-strong bg-surface-raised px-4 py-3 text-sm text-text shadow-[0_8px_30px_rgb(0_0_0/0.35)]"
            >
              {t.tone === "success" ? (
                <CheckCircle2 className="mt-px size-4 shrink-0 text-signal" aria-hidden />
              ) : (
                <XCircle className="mt-px size-4 shrink-0 text-danger" aria-hidden />
              )}
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext>
  );
}

export function useToast() {
  const push = use(ToastContext);
  if (!push) throw new Error("useToast must be used inside ToastProvider");
  return push;
}
