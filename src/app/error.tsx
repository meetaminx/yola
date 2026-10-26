"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { YolaLogo } from "@/components/ui/logo";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error ? String((error as Error & { digest?: string }).digest ?? "") : "";
  return (
    <main id="main" className="flex min-h-[100svh] flex-col px-5 py-8 md:px-8">
      <Link href="/" aria-label="Yola home" className="self-start">
        <YolaLogo />
      </Link>
      <div className="mx-auto my-auto w-full max-w-[52ch] py-16">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">Error</p>
        <h1 className="type-heading mt-3 text-[clamp(2rem,5vw,3rem)]">Something went wrong on our side.</h1>
        <p className="mt-4 leading-relaxed text-muted">
          Try again. If it keeps happening, contact the operator and include the reference below. No payment status was
          changed by this error.
        </p>
        {digest && <p className="mt-4 font-mono text-xs text-faint">Reference {digest}</p>}
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button onClick={() => retry()}>Try again</Button>
          <Link href="/" className="text-sm text-brand-soft hover:underline">Go home</Link>
        </div>
      </div>
    </main>
  );
}
