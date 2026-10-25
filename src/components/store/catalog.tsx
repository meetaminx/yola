"use client";

import { Check, Compass, Coffee, Flashlight, Map, NotebookPen, Plus, ShoppingBag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PRODUCTS, type Product } from "@/lib/store/catalog";
import { useStore } from "./store-provider";

export const PRODUCT_ICONS: Record<Product["icon"], typeof Compass> = {
  notebook: NotebookPen,
  mug: Coffee,
  tote: ShoppingBag,
  compass: Compass,
  headlamp: Flashlight,
  map: Map,
};

export function ProductArt({ icon, size = "lg" }: { icon: Product["icon"]; size?: "lg" | "sm" }) {
  const Icon = PRODUCT_ICONS[icon];
  return (
    <div
      aria-hidden
      className={
        size === "lg"
          ? "flex aspect-[4/3] items-center justify-center rounded-lg bg-[#E9EBEF]"
          : "flex size-12 shrink-0 items-center justify-center rounded-md bg-[#E9EBEF]"
      }
    >
      <Icon className={size === "lg" ? "size-12 text-[#3A3F4B]" : "size-5 text-[#3A3F4B]"} strokeWidth={1.4} />
    </div>
  );
}

function AddButton({ sku, name }: { sku: string; name: string }) {
  const { add } = useStore();
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      onClick={() => {
        add(sku);
        setAdded(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setAdded(false), 1400);
      }}
      aria-label={`Add ${name} to cart`}
      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#08090D] px-3 text-sm text-white transition-colors hover:bg-[#262A33] active:translate-y-px"
    >
      {added ? <Check className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />}
      {added ? "Added" : "Add to cart"}
      <span className="sr-only" role="status">
        {added ? `${name} added to cart` : ""}
      </span>
    </button>
  );
}

export function Catalog() {
  return (
    <>
      <div className="mb-10 max-w-[60ch]">
        <h1 className="font-display text-[clamp(2rem,4vw,2.75rem)] font-semibold tracking-tight">Small goods for long walks</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-[#4B5160]">
          A fictional shop. Pick something, check out with ZEC, and watch each step of the payment as Yola tracks it.
        </p>
      </div>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PRODUCTS.map((p) => (
          <li key={p.sku} className="flex flex-col rounded-xl border border-black/10 bg-white p-4">
            <ProductArt icon={p.icon} />
            <div className="mt-4 flex flex-1 flex-col">
              <h2 className="font-medium">{p.name}</h2>
              <p className="mt-1 text-sm text-[#4B5160]">{p.blurb}</p>
              <div className="mt-4 flex items-center justify-between">
                <span className="font-mono text-[15px]">{p.price} ZEC</span>
                <AddButton sku={p.sku} name={p.name} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
