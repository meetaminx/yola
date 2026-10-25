import { cn } from "@/lib/utils/cn";

/**
 * The Yola mark: two inputs (merchant, customer) converge at a node and
 * continue as one verified line. The same idea as the payment rail.
 */
export function YolaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={cn("size-7", className)}>
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="#11131A" stroke="rgb(248 250 252 / 0.1)" />
      <path d="M9 8.5 L16 16.5" stroke="#C4B5FD" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M23 8.5 L16 16.5" stroke="#8B5CF6" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M16 16.5 V24" stroke="#F8FAFC" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="16.5" r="2.6" fill="#C7F36B" />
    </svg>
  );
}

export function YolaLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <YolaMark />
      <span className="font-display text-[19px] font-semibold tracking-[-0.03em] text-text">yola</span>
    </span>
  );
}
