import Link from "next/link";
import { YolaLogo } from "@/components/ui/logo";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-[100svh] flex-col px-5 py-8 md:px-8">
      <Link href="/" aria-label="Yola home" className="self-start">
        <YolaLogo />
      </Link>
      <div className="mx-auto my-auto w-full max-w-[52ch] py-16">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">404</p>
        <h1 className="type-heading mt-3 text-[clamp(2rem,5vw,3rem)]">This page does not exist.</h1>
        <p className="mt-4 leading-relaxed text-muted">
          The link may be old, or the address mistyped. Payment status pages need the full payment request ID.
        </p>
        <nav aria-label="Where to go next" className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <Link href="/" className="text-brand-soft hover:underline">Home</Link>
          <Link href="/docs" className="text-brand-soft hover:underline">Documentation</Link>
          <Link href="/playground" className="text-brand-soft hover:underline">API playground</Link>
          <Link href="/dashboard" className="text-brand-soft hover:underline">Dashboard</Link>
        </nav>
      </div>
    </main>
  );
}
