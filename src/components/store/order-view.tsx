"use client";

import { AlertCircle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PaymentTimeline } from "@/components/payments/payment-timeline";
import { SimulatorControls } from "@/components/payments/simulator-controls";
import { PaymentQr } from "@/components/qr/payment-qr";
import { CopyButton } from "@/components/ui/copy-button";
import { EnvironmentBadge } from "@/components/ui/status-badge";
import { formatZecTrimmed } from "@/lib/payments/amount";
import type { SimulateAction } from "@/lib/payments/demo-adapter";
import { ORDER_STATUS_COPY, orderStatusFor, type Order, type OrderStatus } from "@/lib/store/orders";
import { cn } from "@/lib/utils/cn";
import { YolaPaymentStatus } from "@yola/sdk/react";
import { useStore } from "./store-provider";

type Load = { state: "loading" } | { state: "missing" } | { state: "error"; message: string } | { state: "ready"; order: Order };

const HEADLINE_ICON: Record<OrderStatus, typeof Clock> = {
  awaiting_payment: Clock,
  payment_pending: Loader2,
  paid: CheckCircle2,
  needs_attention: AlertCircle,
  expired: AlertCircle,
  cancelled: AlertCircle,
};

export function OrderView() {
  const { orderId } = useParams<{ orderId: string }>();
  const { backend, clear } = useStore();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const cleared = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const order = await backend.getOrder(orderId);
      setLoad(order ? { state: "ready", order } : { state: "missing" });
    } catch (err) {
      setLoad({ state: "error", message: err instanceof Error ? err.message : "The order could not be loaded." });
    }
  }, [backend, orderId]);

  useEffect(() => {
    const t = setTimeout(refresh, 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const order = load.state === "ready" ? load.order : null;
  const status = order ? orderStatusFor(order.payment.status) : null;

  useEffect(() => {
    if (status === "paid" && !cleared.current) {
      cleared.current = true;
      clear();
    }
  }, [status, clear]);

  async function act(fn: () => Promise<Order>) {
    setBusy(true);
    setActionError(null);
    try {
      const next = await fn();
      setLoad({ state: "ready", order: next });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (load.state === "loading") {
    return <div className="h-96 animate-pulse rounded-xl bg-black/[0.05]" aria-busy="true" aria-label="Loading order" />;
  }
  if (load.state === "missing" || load.state === "error") {
    return (
      <div className="rounded-xl border border-black/10 bg-white px-6 py-14 text-center">
        <h1 className="font-display text-2xl font-semibold">{load.state === "missing" ? "Order not found" : "Could not load the order"}</h1>
        <p className="mx-auto mt-2 max-w-[52ch] text-[#4B5160]">
          {load.state === "missing"
            ? "This sample keeps orders in your browser tab only, so they are gone after a reload. Your cart is still saved."
            : load.message}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {load.state === "error" && (
            <button type="button" onClick={refresh} className="inline-flex h-10 items-center rounded-md border border-black/15 px-4 text-sm hover:bg-black/[0.04]">
              Try again
            </button>
          )}
          <Link href="/examples/store/checkout" className="inline-flex h-10 items-center rounded-md bg-[#08090D] px-4 text-sm text-white hover:bg-[#262A33]">
            Back to checkout
          </Link>
        </div>
      </div>
    );
  }

  const o = load.order;
  const s = orderStatusFor(o.payment.status);
  const copy = ORDER_STATUS_COPY[s];
  const Icon = HEADLINE_ICON[s];
  const closed = s === "expired" || s === "cancelled";

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div className="flex min-w-0 flex-col gap-6">
        <div>
          <p className="font-mono text-sm text-[#4B5160]">Order {o.id.slice(4).toUpperCase()}</p>
          <h1 className="mt-1 flex items-center gap-3 font-display text-3xl font-semibold tracking-tight" aria-live="polite">
            <Icon
              className={cn(
                "size-7 shrink-0",
                s === "paid" ? "text-[#15803D]" : closed || s === "needs_attention" ? "text-[#B45309]" : "text-[#4B5160]",
                s === "payment_pending" && "animate-spin motion-reduce:animate-none",
              )}
              aria-hidden
            />
            {copy.title}
          </h1>
          <p className="mt-2 text-[#4B5160]">{copy.body}</p>
        </div>

        {(s === "awaiting_payment" || s === "payment_pending") && (
          <section aria-labelledby="pay-title" className="rounded-xl border border-black/10 bg-white p-5">
            <h2 id="pay-title" className="font-medium">
              {o.payment.status === "underpaid" && o.payment.amount_received_zatoshis
                ? `Pay the remaining ${formatZecTrimmed(BigInt(o.payment.amount_zatoshis) - BigInt(o.payment.amount_received_zatoshis))} ZEC`
                : `Pay ${o.total} ZEC`}
            </h2>
            <p className="mt-1 text-sm text-[#4B5160]">
              Scan the code with a Zcash wallet, or copy the payment details. Pay the exact amount before the timer
              runs out.
            </p>
            <div className="mt-5 grid gap-5 sm:grid-cols-[200px_minmax(0,1fr)]">
              <PaymentQr payload={o.payment.qr_payload} paymentId={o.payment.id} className="[&_button]:text-[#4B5160] [&_button:hover]:bg-black/[0.05] [&_button:hover]:text-[#08090D]" />
              <div className="min-w-0 text-sm">
                <div className="rounded-lg border border-black/10">
                  <div className="flex items-center justify-between border-b border-black/10 py-1 pr-1 pl-3">
                    <span className="text-xs text-[#4B5160]">Payment details</span>
                    <CopyButton value={o.payment.qr_payload} label="payment details" className="text-[#4B5160] hover:bg-black/[0.05] hover:text-[#08090D]" />
                  </div>
                  <p className="break-all px-3 py-2.5 font-mono text-xs">{o.payment.qr_payload}</p>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[#4B5160]">
                  This is a simulated request. Real wallets will not recognise the yola-demo: link, so no funds can be
                  sent by mistake. Use the simulated wallet on this page instead.
                </p>
              </div>
            </div>
          </section>
        )}

        <YolaPaymentStatus
          key={o.payment.id}
          appearance="light"
          paymentId={o.payment.id}
          network={o.payment.network}
          amount={o.payment.amount}
          initialStatus={o.payment.status}
          fetchStatus={(id, signal) => backend.fetchStatus(id, signal)}
          pollInterval={1500}
          onStatusChange={() => void refresh()}
        />

        {closed && (
          <div className="flex flex-wrap gap-3">
            <Link href="/examples/store/checkout" className="inline-flex h-11 items-center rounded-md bg-[#08090D] px-5 text-sm font-medium text-white hover:bg-[#262A33]">
              Start a new checkout
            </Link>
            <Link href="/examples/store/cart" className="inline-flex h-11 items-center rounded-md border border-black/15 px-5 text-sm hover:bg-black/[0.04]">
              Review cart
            </Link>
          </div>
        )}
        {s === "paid" && (
          <Link href="/examples/store" className="inline-flex h-11 w-fit items-center rounded-md bg-[#08090D] px-5 text-sm font-medium text-white hover:bg-[#262A33]">
            Continue shopping
          </Link>
        )}

        <section aria-labelledby="items-title" className="rounded-xl border border-black/10 bg-white p-5">
          <h2 id="items-title" className="font-medium">
            Items
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {o.lines.map((l) => (
              <li key={l.sku} className="flex justify-between gap-4">
                <span className="text-[#4B5160]">
                  {l.name} <span className="font-mono">x{l.qty}</span>
                </span>
                <span className="font-mono">{l.lineTotal} ZEC</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-black/10 pt-3 font-medium">
            <span>Total</span>
            <span className="font-mono">{o.total} ZEC</span>
          </div>
        </section>
      </div>

      {/* The customer's wallet and the network, simulated. Styled as Yola, not as the shop. */}
      <aside aria-labelledby="sim-title" className="h-fit rounded-xl bg-bg p-5 text-text">
        <h2 id="sim-title" className="type-heading text-lg">
          Simulated wallet
        </h2>
        <p className="mt-1 mb-4 text-sm text-muted">
          Play the customer and the network. Each button calls the payment request&apos;s simulate endpoint.
        </p>
        <EnvironmentBadge env="simulated" />
        <div className="mt-5">
          <SimulatorControls
            payment={o.payment}
            busy={busy}
            onAction={(a: SimulateAction) => act(() => backend.simulate(o.id, a))}
            onCancel={() => act(() => backend.cancelOrder(o.id))}
          />
          {actionError && (
            <p role="alert" className="mt-3 text-[13px] text-danger">
              {actionError}
            </p>
          )}
        </div>
        <PaymentTimeline className="mt-6 border-t border-line pt-5" history={o.payment.history} trustLevel={o.payment.trust_level} />
      </aside>
    </div>
  );
}
