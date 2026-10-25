"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { findProduct, MAX_QTY, priceCart } from "@/lib/store/catalog";
import { ProductArt } from "./catalog";
import { useStore } from "./store-provider";

export function CartView() {
  const { cart, ready, setQty, remove } = useStore();

  if (!ready) return <div className="h-64 animate-pulse rounded-xl bg-black/[0.05]" aria-busy="true" aria-label="Loading cart" />;

  if (cart.length === 0) {
    return (
      <div className="rounded-xl border border-black/10 bg-white px-6 py-14 text-center">
        <h1 className="font-display text-2xl font-semibold">Your cart is empty</h1>
        <p className="mt-2 text-[#4B5160]">Add something from the shop to try a ZEC checkout.</p>
        <Link href="/examples/store" className="mt-6 inline-flex h-10 items-center rounded-md bg-[#08090D] px-4 text-sm text-white hover:bg-[#262A33]">
          Browse products
        </Link>
      </div>
    );
  }

  const priced = priceCart(cart);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
      <section aria-labelledby="cart-title">
        <h1 id="cart-title" className="mb-6 font-display text-3xl font-semibold tracking-tight">
          Cart
        </h1>
        <ul className="divide-y divide-black/10 rounded-xl border border-black/10 bg-white">
          {priced.lines.map((l) => {
            const product = findProduct(l.sku)!;
            return (
              <li key={l.sku} className="flex flex-wrap items-center gap-4 p-4">
                <ProductArt icon={product.icon} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.name}</p>
                  <p className="font-mono text-sm text-[#4B5160]">{l.unit} ZEC each</p>
                </div>
                <div className="flex items-center rounded-md border border-black/15" role="group" aria-label={`Quantity of ${l.name}`}>
                  <button
                    type="button"
                    onClick={() => setQty(l.sku, l.qty - 1)}
                    aria-label={`Decrease quantity of ${l.name}`}
                    className="flex size-9 items-center justify-center hover:bg-black/[0.04]"
                  >
                    <Minus className="size-3.5" aria-hidden />
                  </button>
                  <span className="w-8 text-center font-mono text-sm" aria-live="polite">
                    {l.qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQty(l.sku, l.qty + 1)}
                    disabled={l.qty >= MAX_QTY}
                    aria-label={`Increase quantity of ${l.name}`}
                    className="flex size-9 items-center justify-center hover:bg-black/[0.04] disabled:opacity-40"
                  >
                    <Plus className="size-3.5" aria-hidden />
                  </button>
                </div>
                <span className="w-24 text-right font-mono text-sm">{l.lineTotal} ZEC</span>
                <button
                  type="button"
                  onClick={() => remove(l.sku)}
                  aria-label={`Remove ${l.name}`}
                  className="flex size-9 items-center justify-center rounded-md text-[#4B5160] hover:bg-black/[0.04] hover:text-[#08090D]"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <aside className="h-fit rounded-xl border border-black/10 bg-white p-5 lg:mt-[60px]">
        <h2 className="font-medium">Summary</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-[#4B5160]">Items</dt>
            <dd>{cart.reduce((n, l) => n + l.qty, 0)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-[#4B5160]">Shipping</dt>
            <dd>Free</dd>
          </div>
          <div className="flex justify-between border-t border-black/10 pt-3 text-base font-medium">
            <dt>Total</dt>
            <dd className="font-mono">{priced.total} ZEC</dd>
          </div>
        </dl>
        <Link
          href="/examples/store/checkout"
          className="mt-5 flex h-11 w-full items-center justify-center rounded-md bg-[#08090D] text-sm font-medium text-white hover:bg-[#262A33]"
        >
          Continue to checkout
        </Link>
        <Link href="/examples/store" className="mt-3 block text-center text-sm text-[#4B5160] hover:text-[#08090D]">
          Keep shopping
        </Link>
      </aside>
    </div>
  );
}
