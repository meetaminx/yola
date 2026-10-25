"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useStore } from "./store-provider";

export function StoreHeader() {
  const { count } = useStore();
  return (
    <header className="border-b border-black/10 bg-white">
      <div className="mx-auto flex h-16 max-w-[1100px] items-center justify-between px-5 md:px-8">
        <Link href="/examples/store" className="font-display text-lg font-semibold tracking-tight text-[#08090D]">
          Fernhill Supply
        </Link>
        <Link
          href="/examples/store/cart"
          className="relative inline-flex h-10 items-center gap-2 rounded-md border border-black/15 px-3 text-sm text-[#08090D] transition-colors hover:bg-black/[0.04]"
          aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
        >
          <ShoppingBag className="size-4" aria-hidden />
          Cart
          <span className="min-w-5 rounded-md bg-[#08090D] px-1.5 text-center font-mono text-xs leading-5 text-white">{count}</span>
        </Link>
      </div>
    </header>
  );
}
