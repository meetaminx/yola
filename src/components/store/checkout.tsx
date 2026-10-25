"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useState, type FormEvent } from "react";
import { priceCart } from "@/lib/store/catalog";
import { cn } from "@/lib/utils/cn";
import { useStore } from "./store-provider";

type Method = "zec" | "card";

export function CheckoutView() {
  const { cart, ready, backend } = useStore();
  const router = useRouter();
  const [method, setMethod] = useState<Method | null>(null);
  const [methodError, setMethodError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Next.js keeps visited pages alive (hidden) with React Activity. Reset the
  // in-flight state when this page is hidden, so coming back after placing an
  // order shows a usable form instead of a stuck "Creating" button.
  useLayoutEffect(() => {
    return () => {
      setSubmitting(false);
      setError(null);
    };
  }, []);

  if (!ready) return <div className="h-64 animate-pulse rounded-xl bg-black/[0.05]" aria-busy="true" aria-label="Loading checkout" />;

  if (cart.length === 0) {
    return (
      <div className="rounded-xl border border-black/10 bg-white px-6 py-14 text-center">
        <h1 className="font-display text-2xl font-semibold">Nothing to check out</h1>
        <p className="mt-2 text-[#4B5160]">Your cart is empty.</p>
        <Link href="/examples/store" className="mt-6 inline-flex h-10 items-center rounded-md bg-[#08090D] px-4 text-sm text-white hover:bg-[#262A33]">
          Browse products
        </Link>
      </div>
    );
  }

  const priced = priceCart(cart);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (method !== "zec") {
      setMethodError(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const order = await backend.createOrder(cart);
      router.push(`/examples/store/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The payment request could not be created.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
      <div>
        <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight">Checkout</h1>
        <fieldset className="rounded-xl border border-black/10 bg-white p-5" aria-describedby={methodError ? "method-error" : undefined}>
          <legend className="sr-only">Payment method</legend>
          <p className="mb-4 font-medium" aria-hidden>
            Payment method
          </p>
          <div className="grid gap-3">
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#6D28D9]",
                method === "zec" ? "border-[#08090D] bg-black/[0.02]" : "border-black/15 hover:border-black/30",
              )}
            >
              <input
                type="radio"
                name="method"
                value="zec"
                checked={method === "zec"}
                onChange={() => {
                  setMethod("zec");
                  setMethodError(false);
                }}
                className="mt-1 accent-[#08090D]"
              />
              <span>
                <span className="block font-medium">Zcash (ZEC)</span>
                <span className="mt-0.5 block text-sm text-[#4B5160]">
                  Pay from any Zcash wallet. You will get a QR code and a payment link. In this sample the payment is
                  simulated.
                </span>
              </span>
            </label>
            <label className="flex cursor-not-allowed items-start gap-3 rounded-lg border border-black/10 p-4 opacity-60">
              <input type="radio" name="method" value="card" disabled className="mt-1" />
              <span>
                <span className="block font-medium">Card</span>
                <span className="mt-0.5 block text-sm text-[#4B5160]">Not part of this sample.</span>
              </span>
            </label>
          </div>
          {methodError && (
            <p id="method-error" role="alert" className="mt-3 text-sm text-[#BE123C]">
              Choose a payment method to continue.
            </p>
          )}
        </fieldset>
      </div>

      <aside className="h-fit rounded-xl border border-black/10 bg-white p-5 lg:mt-[60px]">
        <h2 className="font-medium">Order summary</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {priced.lines.map((l) => (
            <li key={l.sku} className="flex justify-between gap-4">
              <span className="text-[#4B5160]">
                {l.name} <span className="font-mono">x{l.qty}</span>
              </span>
              <span className="font-mono">{l.lineTotal}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-black/10 pt-3 font-medium">
          <span>Total</span>
          <span className="font-mono">{priced.total} ZEC</span>
        </div>
        {error && (
          <div role="alert" className="mt-4 flex gap-2 rounded-md bg-[#FFF1F2] p-3 text-sm text-[#9F1239]">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              {error} Your cart is unchanged; try again.
            </span>
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#08090D] text-sm font-medium text-white hover:bg-[#262A33] disabled:opacity-60"
        >
          {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {submitting ? "Creating payment request" : "Place order and pay"}
        </button>
        <Link href="/examples/store/cart" className="mt-3 block text-center text-sm text-[#4B5160] hover:text-[#08090D]">
          Back to cart
        </Link>
      </aside>
    </form>
  );
}
