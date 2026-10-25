"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PaymentStatus, PaymentStatusResponse } from "../types";

export type FetchStatus = (paymentId: string, signal: AbortSignal) => Promise<PaymentStatusResponse>;

export interface UsePaymentStatusOptions {
  paymentId: string;
  /**
   * An endpoint on YOUR server that returns the Yola status JSON for this
   * payment. Never call the Yola API from the browser with a secret key.
   */
  statusUrl?: string;
  /** Alternative to statusUrl: fetch the status however you like. */
  fetchStatus?: FetchStatus;
  /** Milliseconds between polls while the payment is open. Minimum 1000. Default 3000. */
  pollInterval?: number;
  initial?: PaymentStatusResponse | null;
  onStatusChange?: (next: PaymentStatusResponse, previous: PaymentStatus | null) => void;
  /** Called once when the payment reaches "confirmed" (or "overpaid": the requested amount confirmed). */
  onConfirmed?: (status: PaymentStatusResponse) => void;
}

export interface PaymentStatusState {
  data: PaymentStatusResponse | null;
  /** Message for the most recent failed poll, cleared on the next success. */
  error: string | null;
  /** Epoch ms of the last successful poll. */
  lastUpdated: number | null;
  /** Consecutive failures. Polling backs off exponentially, up to 30 s. */
  failures: number;
  loading: boolean;
  /** Poll again now (after an error, or on demand). */
  refresh: () => void;
}

const MAX_BACKOFF = 30_000;

async function defaultFetch(url: string, signal: AbortSignal): Promise<PaymentStatusResponse> {
  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store", signal });
  if (!res.ok) throw new Error(`Status check failed (HTTP ${res.status}).`);
  return (await res.json()) as PaymentStatusResponse;
}

/**
 * Polls a payment's status until it is final. Pauses while the tab is
 * hidden, backs off on errors, and never infers a status on its own:
 * whatever the server reports is what you get.
 */
export function usePaymentStatus(opts: UsePaymentStatusOptions): PaymentStatusState {
  const { paymentId, statusUrl, fetchStatus } = opts;
  const interval = Math.max(1000, opts.pollInterval ?? 3000);
  const [data, setData] = useState<PaymentStatusResponse | null>(opts.initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [failures, setFailures] = useState(0);
  const [loading, setLoading] = useState(!opts.initial);
  const [tick, setTick] = useState(0);

  // Latest callbacks and fetcher live in a ref, so passing inline functions
  // never restarts polling.
  const callbacks = useRef({ onStatusChange: opts.onStatusChange, onConfirmed: opts.onConfirmed, fetchStatus });
  useEffect(() => {
    callbacks.current = { onStatusChange: opts.onStatusChange, onConfirmed: opts.onConfirmed, fetchStatus };
  });
  const hasFetcher = typeof fetchStatus === "function";
  const previous = useRef<PaymentStatus | null>(opts.initial?.status ?? null);
  const confirmedFired = useRef(false);

  const final = data?.final ?? false;

  useEffect(() => {
    if (final) return;
    if (!statusUrl && !hasFetcher) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let consecutive = 0;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(run, ms);
    };

    async function run() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return; // resumed on visibilitychange
      controller = new AbortController();
      try {
        const fetcher = callbacks.current.fetchStatus;
        const next = fetcher ? await fetcher(paymentId, controller.signal) : await defaultFetch(statusUrl!, controller.signal);
        if (cancelled) return;
        if (next.id !== paymentId) throw new Error("The status response is for a different payment.");
        consecutive = 0;
        setData(next);
        setError(null);
        setFailures(0);
        setLastUpdated(Date.now());
        setLoading(false);
        if (next.status !== previous.current) {
          const prev = previous.current;
          previous.current = next.status;
          callbacks.current.onStatusChange?.(next, prev);
        }
        if ((next.status === "confirmed" || next.status === "overpaid") && !confirmedFired.current) {
          confirmedFired.current = true;
          callbacks.current.onConfirmed?.(next);
        }
        if (!next.final) schedule(interval);
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === "AbortError")) return;
        consecutive += 1;
        setFailures(consecutive);
        setLoading(false);
        setError(err instanceof Error ? err.message : "Status check failed.");
        schedule(Math.min(MAX_BACKOFF, interval * 2 ** consecutive));
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") schedule(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    schedule(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [paymentId, statusUrl, hasFetcher, interval, final, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, lastUpdated, failures, loading, refresh };
}
