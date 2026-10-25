import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export const DOCS_NAV = [
  {
    group: "Start",
    items: [
      { href: "/docs", label: "Introduction" },
      { href: "/docs/quickstart", label: "Quickstart" },
      { href: "/docs/architecture", label: "Architecture and verification" },
    ],
  },
  {
    group: "Integrate",
    items: [
      { href: "/docs/api", label: "API reference" },
      { href: "/docs/sdks", label: "TypeScript SDK" },
      { href: "/docs/qr", label: "QR codes and ZIP 321" },
      { href: "/docs/webhooks", label: "Webhooks" },
    ],
  },
  {
    group: "Operate",
    items: [
      { href: "/docs/testnet", label: "Testnet" },
      { href: "/docs/security", label: "Security model" },
    ],
  },
];

export function DocPage({ title, lead, children }: { title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <article className="min-w-0 max-w-[72ch]">
      <nav aria-label="Breadcrumb" className="mb-6 text-[13px] text-muted">
        <Link href="/docs" className="hover:text-text">
          Docs
        </Link>
        <span aria-hidden className="mx-2 text-faint">/</span>
        <span className="text-text">{title}</span>
      </nav>
      <h1 className="type-heading text-[clamp(2rem,4vw,2.75rem)]">{title}</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted">{lead}</p>
      <div className="doc-prose mt-10">{children}</div>
    </article>
  );
}

export function Callout({ tone = "info", title, children }: { tone?: "info" | "warn"; title: string; children: ReactNode }) {
  return (
    <aside
      className={cn(
        "my-6 rounded-xl border p-4 text-[14.5px] leading-relaxed",
        tone === "warn" ? "border-warning/25 bg-warning/[0.06]" : "border-brand/25 bg-brand/[0.06]",
      )}
    >
      <p className={cn("font-medium", tone === "warn" ? "text-warning" : "text-brand-soft")}>{title}</p>
      <div className="mt-1 text-text/85">{children}</div>
    </aside>
  );
}

export function Status({ children }: { children: ReactNode }) {
  return (
    <p className="!mt-0 mb-8 inline-flex rounded-md border border-line-strong bg-surface px-2.5 py-1 text-[13px] !text-muted">
      {children}
    </p>
  );
}
