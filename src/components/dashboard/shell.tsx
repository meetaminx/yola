"use client";

import { AnimatePresence, motion } from "motion/react";
import { BookOpen, Code2, FlaskConical, KeyRound, LayoutGrid, Menu, Receipt, Settings, Webhook, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { transition } from "@/components/motion/tokens";
import { YolaLogo } from "@/components/ui/logo";
import { cn } from "@/lib/utils/cn";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/dashboard/payments", label: "Payments", icon: Receipt },
  { href: "/dashboard/playground", label: "Playground", icon: FlaskConical },
  { group: "Developers" },
  { href: "/dashboard/developers/api-keys", label: "API keys", icon: KeyRound },
  { href: "/dashboard/developers/webhooks", label: "Webhooks", icon: Webhook },
  { group: "Project" },
  { href: "/dashboard/projects", label: "Projects", icon: Code2 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
] as const;

const ShellContext = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <ShellContext value={{ open, setOpen }}>{children}</ShellContext>;
}

function useShell() {
  const ctx = use(ShellContext);
  if (!ctx) throw new Error("useShell must be inside ShellProvider");
  return ctx;
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboard" className="flex flex-col gap-0.5 text-sm">
      {NAV.map((item, i) => {
        if ("group" in item) {
          return (
            <p key={item.group} className={cn("px-3 pb-1 text-xs text-faint", i > 0 && "mt-5")}>
              {item.group}
            </p>
          );
        }
        const active = "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-9 items-center gap-2.5 rounded-md px-3 transition-colors duration-[var(--dur-quick)]",
              active ? "text-text" : "text-muted hover:bg-white/[0.03] hover:text-text",
            )}
          >
            {active && (
              <motion.span layoutId="dash-nav" transition={transition.statusChange} className="absolute inset-0 rounded-md bg-white/[0.06]" />
            )}
            <Icon className="relative size-4" aria-hidden />
            <span className="relative">{item.label}</span>
          </Link>
        );
      })}
      <Link href="/docs" className="mt-6 flex h-9 items-center gap-2.5 rounded-md px-3 text-muted hover:text-text">
        <BookOpen className="size-4" aria-hidden /> Documentation
      </Link>
    </nav>
  );
}

export function Sidebar() {
  const { open, setOpen } = useShell();
  const pathname = usePathname();

  // Close the drawer when the route changes or Escape is pressed.
  useEffect(() => {
    const t = setTimeout(() => setOpen(false), 0);
    return () => clearTimeout(t);
  }, [pathname, setOpen]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line px-3 py-5 lg:flex">
        <Link href="/" className="mb-8 px-3" aria-label="Yola home">
          <YolaLogo />
        </Link>
        <NavLinks />
      </aside>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <motion.aside
              id="dash-drawer"
              aria-label="Dashboard menu"
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-bg px-3 py-5 lg:hidden"
              initial={{ x: -24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0 }}
              transition={transition.reveal}
            >
              <div className="mb-8 flex items-center justify-between px-3">
                <YolaLogo />
                <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="flex size-9 items-center justify-center rounded-md text-muted hover:text-text">
                  <X className="size-5" />
                </button>
              </div>
              <NavLinks onNavigate={() => setOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export function MenuButton() {
  const { open, setOpen } = useShell();
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-controls="dash-drawer"
      aria-label="Open menu"
      className="flex size-10 items-center justify-center rounded-md text-text lg:hidden"
    >
      <Menu className="size-5" />
    </button>
  );
}
