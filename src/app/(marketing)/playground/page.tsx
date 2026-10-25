import { Playground } from "@/components/playground/playground";

export const metadata = {
  title: "Playground",
  description: "Send real Yola API requests to an in-browser simulator and inspect the response, QR code and status.",
};

export default function PlaygroundPage() {
  return (
    <section className="mx-auto max-w-[1200px] px-5 pt-12 pb-20 md:px-8 md:pt-16">
      <div className="mb-10 grid gap-4 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:items-end">
        <h1 className="type-heading text-[clamp(2.25rem,5vw,3.5rem)]">API playground</h1>
        <p className="max-w-[48ch] text-[17px] leading-relaxed text-muted md:pb-1">
          Every request here runs Yola&apos;s real validation, idempotency and payment state machine, inside your
          browser. Nothing is stored and nothing touches a blockchain.
        </p>
      </div>
      <Playground />
    </section>
  );
}
