import { ArrowUpRight, BookOpen, Code2, FileCode2, Network, QrCode, ShieldCheck, Webhook, Workflow } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Features } from "@/components/marketing/features";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { IntegrationTabs } from "@/components/marketing/integration-tabs";
import { PaymentRail } from "@/components/marketing/payment-rail";
import { PrivacySection } from "@/components/marketing/privacy-section";
import { LiveDemo } from "@/components/payments/live-demo";
import { ButtonLink } from "@/components/ui/button";

function Section({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-[1200px] px-5 md:px-8 ${className}`}>
      {children}
    </section>
  );
}

function SectionHead({ title, body }: { title: ReactNode; body?: ReactNode }) {
  return (
    <div className="mb-10 grid gap-4 md:mb-14 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:items-end">
      <h2 className="type-heading text-[clamp(2rem,4vw,3rem)]">{title}</h2>
      {body && <p className="max-w-[48ch] text-[17px] leading-relaxed text-muted md:pb-1">{body}</p>}
    </div>
  );
}

const RESOURCES = [
  { href: "/docs/quickstart", icon: BookOpen, title: "Quickstart", body: "From clone to a simulated payment in a few minutes." },
  { href: "/docs/api", icon: Code2, title: "API reference", body: "The v1 payment-request contract, errors and idempotency." },
  { href: "/docs/sdks", icon: FileCode2, title: "SDK guide", body: "The typed TypeScript client and its safety rails." },
  { href: "/docs/qr", icon: QrCode, title: "QR integration", body: "ZIP 321 payment URIs and when Yola can build one." },
  { href: "/docs/testnet", icon: Network, title: "Testnet guide", body: "What a real testnet setup needs, and what is missing." },
  { href: "/docs/webhooks", icon: Webhook, title: "Webhook guide", body: "Signature format, replay protection and retries." },
  { href: "/docs/security", icon: ShieldCheck, title: "Security model", body: "Keys, custody, logging and the threat model." },
  { href: "/docs/architecture", icon: Workflow, title: "Architecture", body: "How Yola attributes and verifies shielded payments." },
];

export default function HomePage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        <div aria-hidden className="ambient pointer-events-none absolute inset-0" />
        <div aria-hidden className="grid-texture pointer-events-none absolute inset-0 opacity-60" />
        <Section className="relative pt-12 pb-20 md:pt-16 md:pb-28">
          <p className="mb-7 inline-flex items-center gap-2.5 text-[13.5px] text-muted">
            <span aria-hidden className="size-1.5 rounded-full bg-signal shadow-[0_0_10px_rgb(199_243_107/0.6)]" />
            Open infrastructure. Privacy-conscious by design.
          </p>
          <h1 className="type-display text-[clamp(2.4rem,8.2vw,6.75rem)]">
            Zcash payments.
            <br />
            Built for builders.
          </h1>
          <div className="mt-8 grid gap-8 md:mt-10 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] lg:items-center">
            <div>
              <p className="max-w-[52ch] text-lg leading-relaxed text-muted">
                Give your website or application the ability to accept ZEC with developer-friendly payment requests,
                QR codes, transaction tracking, and integration tools.
              </p>
            </div>
            <div className="grid gap-3 sm:flex sm:flex-wrap lg:justify-end">
              <ButtonLink href="/docs/quickstart" size="lg">
                Start building
              </ButtonLink>
              <ButtonLink href="/playground" size="lg" variant="secondary">
                Explore the playground
              </ButtonLink>
            </div>
          </div>
          <div className="mt-12 md:mt-16">
            <PaymentRail />
          </div>
        </Section>
      </div>

      {/* ── Live demo ────────────────────────────────── */}
      <Section id="demo" className="py-16 md:py-24">
        <SectionHead
          title={
            <>
              Try a payment request.
              <br />
              No wallet required.
            </>
          }
          body="This demo runs Yola’s real amount parsing and payment state machine against a local simulator. It is labelled as simulated everywhere, because it is."
        />
        <LiveDemo />
      </Section>

      {/* ── Features ─────────────────────────────────── */}
      <Section id="product" className="py-16 md:py-24">
        <SectionHead
          title="The parts every ZEC checkout needs."
          body="Requests, customer-facing components and a lifecycle you can trust. Each of the previews below runs the same code as the product."
        />
        <Features />
      </Section>

      {/* ── Integration ──────────────────────────────── */}
      <Section id="integration" className="py-16 md:py-24">
        <SectionHead
          title="From zero to your first payment."
          body={
            <>
              Four pieces of server code. Everything shown here uses the SDK in this repository, imported as{" "}
              <code className="font-mono text-[15px] text-text">@yola/sdk</code>.
            </>
          }
        />
        <IntegrationTabs />
      </Section>

      {/* ── How it works ─────────────────────────────── */}
      <Section className="py-16 md:py-24">
        <SectionHead title="How it works" />
        <HowItWorks />
      </Section>

      {/* ── Privacy & security ───────────────────────── */}
      <Section id="security" className="py-16 md:py-24">
        <PrivacySection />
      </Section>

      {/* ── Resources ────────────────────────────────── */}
      <Section className="py-16 md:py-24">
        <SectionHead title="Developer resources" />
        <ul className="grid border-t border-l border-line sm:grid-cols-2 lg:grid-cols-4">
          {RESOURCES.map(({ href, icon: Icon, title, body }) => (
            <li key={href} className="border-r border-b border-line">
              <Link
                href={href}
                className="group flex h-full flex-col p-6 transition-colors duration-[var(--dur-quick)] hover:bg-surface"
              >
                <div className="flex items-center justify-between">
                  <Icon className="size-5 text-brand-soft" aria-hidden />
                  <ArrowUpRight
                    aria-hidden
                    className="size-4 text-faint transition-[color,transform] duration-[var(--dur-quick)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-text"
                  />
                </div>
                <h3 className="mt-6 text-[15px] font-medium text-text">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {/* ── Final CTA ────────────────────────────────── */}
      <Section className="py-16 md:py-24">
        <div className="relative overflow-hidden rounded-[var(--radius-panel)] border border-line px-6 py-16 md:px-14 md:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_90%_at_100%_100%,rgb(109_40_217/0.28),transparent_70%)]"
          />
          {/* The rail, arriving at a confirmed node: the brand motif, kept clear of the copy. */}
          <div aria-hidden className="absolute top-1/2 right-[12%] left-[62%] hidden h-px bg-gradient-to-r from-transparent via-brand to-brand-soft lg:block">
            <span className="absolute top-1/2 -right-1.5 size-3 -translate-y-1/2 rounded-full bg-signal shadow-[0_0_16px_3px_rgb(199_243_107/0.45)]" />
          </div>
          <div className="relative max-w-[640px]">
            <h2 className="type-display text-[clamp(2.4rem,5.5vw,4.5rem)]">Your next product can accept ZEC.</h2>
            <p className="mt-5 text-lg text-muted">Start with a payment request. Build the rest your way.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/playground" size="lg">
                Open playground
              </ButtonLink>
              <ButtonLink href="/docs" size="lg" variant="secondary">
                Read the docs
              </ButtonLink>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
