"use client";

import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { MAX_QTY, type CartLine } from "@/lib/store/catalog";
import { createLocalStoreBackend, type StoreBackend } from "@/lib/store/orders";

interface StoreContextValue {
  backend: StoreBackend;
  /** False until the saved cart has been read, so pages don't flash "empty". */
  ready: boolean;
  cart: CartLine[];
  count: number;
  add: (sku: string) => void;
  setQty: (sku: string, qty: number) => void;
  remove: (sku: string) => void;
  clear: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);
const CART_KEY = "yola-sample-store-cart";

function readCart(): CartLine[] {
  try {
    const raw = window.sessionStorage.getItem(CART_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((l): l is CartLine => typeof l?.sku === "string" && Number.isInteger(l?.qty) && l.qty > 0)
      : [];
  } catch {
    return [];
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  // One backend for the whole store session, so orders survive client-side navigation.
  const [backend] = useState<StoreBackend>(() => createLocalStoreBackend());
  const [cart, setCart] = useState<CartLine[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setCart(readCart());
      setLoaded(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.sessionStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      // Storage can be unavailable (private mode). The cart still works in memory.
    }
  }, [cart, loaded]);

  const add = useCallback((sku: string) => {
    setCart((c) => {
      const line = c.find((l) => l.sku === sku);
      return line ? c.map((l) => (l.sku === sku ? { ...l, qty: Math.min(MAX_QTY, l.qty + 1) } : l)) : [...c, { sku, qty: 1 }];
    });
  }, []);
  const setQty = useCallback((sku: string, qty: number) => {
    setCart((c) => (qty <= 0 ? c.filter((l) => l.sku !== sku) : c.map((l) => (l.sku === sku ? { ...l, qty: Math.min(MAX_QTY, qty) } : l))));
  }, []);
  const remove = useCallback((sku: string) => setCart((c) => c.filter((l) => l.sku !== sku)), []);
  const clear = useCallback(() => setCart([]), []);

  const value = useMemo(
    () => ({ backend, ready: loaded, cart, count: cart.reduce((n, l) => n + l.qty, 0), add, setQty, remove, clear }),
    [backend, loaded, cart, add, setQty, remove, clear],
  );
  return <StoreContext value={value}>{children}</StoreContext>;
}

export function useStore() {
  const ctx = use(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
