import type { ReactNode } from "react";
import { LEGAL_UPDATED, operator } from "@/lib/site";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-[72ch] px-5 pb-24 pt-32 md:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">Last updated {LEGAL_UPDATED}</p>
      <h1 className="type-heading mt-3 text-[clamp(2rem,4vw,2.75rem)]">{title}</h1>
      <div className="doc-prose mt-10">{children}</div>
    </article>
  );
}

export function Contact() {
  const o = operator();
  return o.email ? (
    <a href={`mailto:${o.email}`}>{o.email}</a>
  ) : (
    <span>the contact address published by {o.name}</span>
  );
}
