"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Modal dialog on the native <dialog> element: the browser provides focus
 * trapping, Escape to close, inert background and top-layer stacking.
 * Opening animates with CSS (see .yola-dialog in globals.css), which
 * respects reduced motion.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** False for dialogs that must be acknowledged (e.g. a secret shown once). */
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "yola-dialog m-auto w-[calc(100%-2rem)] max-w-lg rounded-[var(--radius-panel)] border border-line-strong bg-surface p-0 text-text backdrop:bg-black/60",
        className,
      )}
    >
      {open && (
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="type-heading text-xl">
                {title}
              </h2>
              {description && (
                <div id={descId} className="mt-1.5 text-sm leading-relaxed text-muted">
                  {description}
                </div>
              )}
            </div>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mt-1 -mr-2 flex size-9 shrink-0 items-center justify-center rounded-md text-muted hover:bg-white/[0.06] hover:text-text"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="mt-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}
