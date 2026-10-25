"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { DOCS_NAV } from "./docs-ui";

export function DocsSidebar() {
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const groups = DOCS_NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => !query || i.label.toLowerCase().includes(query)),
  })).filter((g) => g.items.length);

  return (
    <nav aria-label="Documentation" className="text-sm">
      <label className="relative mb-6 block">
        <span className="sr-only">Filter documentation pages</span>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter pages"
          className="h-9 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface pr-3 pl-9 text-text outline-none placeholder:text-faint focus:border-brand"
        />
      </label>
      {groups.length === 0 && <p className="text-muted">No pages match “{q}”.</p>}
      {groups.map((g) => (
        <div key={g.group} className="mb-6">
          <p className="mb-2 text-xs text-faint">{g.group}</p>
          <ul className="space-y-0.5 border-l border-line">
            {g.items.map((i) => {
              const active = pathname === i.href;
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "-ml-px block border-l py-1.5 pl-4 transition-colors",
                      active ? "border-brand-soft text-text" : "border-transparent text-muted hover:text-text",
                    )}
                  >
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
