import Link from "next/link";
import { StoreHeader } from "@/components/store/store-chrome";
import { StoreProvider } from "@/components/store/store-provider";
import { YolaMark } from "@/components/ui/logo";

export const metadata = {
  title: { default: "Sample store", template: "%s · Sample store" },
  description: "A fictional shop showing a complete ZEC checkout built with Yola.",
};

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#F4F5F7] text-[#08090D]">
      {/* Yola's frame: makes it unmistakable that this is a demo, not a shop. */}
      <div className="bg-bg text-text">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 py-2.5 text-[13px] md:px-8">
          <p className="flex items-center gap-2">
            <YolaMark className="size-5" />
            <span>
              Yola sample store. Fictional products, simulated payments, nothing ships.
            </span>
          </p>
          <nav aria-label="Sample" className="flex gap-4 text-muted">
            <Link href="/docs/quickstart" className="hover:text-text">
              How it is built
            </Link>
            <Link href="/" className="hover:text-text">
              Back to Yola
            </Link>
          </nav>
        </div>
      </div>
      <StoreProvider>
        <StoreHeader />
        <main id="main" className="mx-auto max-w-[1100px] px-5 py-10 md:px-8 md:py-14">
          {children}
        </main>
      </StoreProvider>
    </div>
  );
}
