"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronsUpDown, LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { switchProjectAction } from "@/app/dashboard/actions";
import { transition } from "@/components/motion/tokens";
import { useToast } from "@/components/ui/toast";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils/cn";

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

const menu = "absolute z-50 mt-2 min-w-[240px] overflow-hidden rounded-xl border border-line-strong bg-surface-raised p-1 shadow-[0_12px_40px_rgb(0_0_0/0.45)]";
const pop = { initial: { opacity: 0, y: -4, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -4 }, transition: transition.reveal };

export function ProjectSwitcher({ current, projects }: { current: { id: string; name: string } | null; projects: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const ref = useDismiss(open, () => setOpen(false));

  function choose(id: string) {
    setOpen(false);
    if (id === current?.id) return;
    start(async () => {
      const r = await switchProjectAction(id);
      if (!r.ok) toast({ tone: "error", message: r.error });
      router.refresh();
    });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        className="flex h-9 max-w-[220px] items-center gap-2 rounded-md border border-line-strong px-3 text-sm text-text hover:bg-white/[0.04] disabled:opacity-60"
      >
        <span className="truncate">{current?.name ?? "No project"}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted" aria-hidden />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div {...pop} role="menu" aria-label="Projects" className={cn(menu, "left-0")}>
            {projects.map((p) => (
              <button
                key={p.id}
                role="menuitemradio"
                aria-checked={p.id === current?.id}
                onClick={() => choose(p.id)}
                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-text hover:bg-white/[0.06]"
              >
                <span className="truncate">{p.name}</span>
                {p.id === current?.id && <Check className="size-4 text-signal" aria-hidden />}
              </button>
            ))}
            <div className="my-1 h-px bg-line" />
            <Link
              role="menuitem"
              href="/dashboard/projects?new=1"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted hover:bg-white/[0.06] hover:text-text"
            >
              <Plus className="size-4" aria-hidden /> New project
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function UserMenu({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useDismiss(open, () => setOpen(false));
  const initials = (name || email).split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${email}`}
        className="flex size-9 items-center justify-center rounded-full border border-line-strong bg-surface text-xs font-medium text-text hover:border-brand-soft/40"
      >
        {initials}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div {...pop} role="menu" aria-label="Account" className={cn(menu, "right-0")}>
            <div className="px-3 py-2">
              <p className="truncate text-sm text-text">{name}</p>
              <p className="truncate text-xs text-muted">{email}</p>
            </div>
            <div className="my-1 h-px bg-line" />
            <button
              role="menuitem"
              onClick={async () => {
                await signOut();
                router.push("/sign-in");
                router.refresh();
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-text hover:bg-white/[0.06]"
            >
              <LogOut className="size-4" aria-hidden /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
