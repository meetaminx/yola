"use client";

import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { transition } from "@/components/motion/tokens";
import { ButtonLink } from "@/components/ui/button";
import { YolaLogo } from "@/components/ui/logo";
import { cn } from "@/lib/utils/cn";

const LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#integration", label: "Developers" },
  { href: "/docs", label: "Documentation" },
  { href: "/playground", label: "Playground" },
  { href: "/examples/store", label: "Sample store" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-[background-color,border-color] duration-[var(--dur-base)]",
        // Blur only once content scrolls underneath, where it aids readability.
        scrolled || open ? "border-line bg-bg/80 backdrop-blur-md" : "border-transparent bg-transparent",
      )}
    >
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5 md:px-8">
        <Link href="/" aria-label="Yola home" className="rounded-md">
          <YolaLogo />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="rounded-md px-3 py-2 text-sm text-muted transition-colors duration-[var(--dur-quick)] hover:text-text"
              >
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 md:flex">
          <ButtonLink href="/docs/quickstart" size="sm">
            Get started
          </ButtonLink>
        </div>

        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-md text-text md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-nav"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transition.reveal}
            className="overflow-hidden border-t border-line md:hidden"
          >
            <ul className="flex flex-col px-5 py-3">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-md py-3 text-[15px] text-text"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
              <li className="pt-2 pb-2">
                <ButtonLink href="/docs/quickstart" className="w-full" onClick={() => setOpen(false)}>
                  Get started
                </ButtonLink>
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
