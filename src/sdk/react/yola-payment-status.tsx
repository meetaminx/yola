"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { Network, PaymentStatus, PaymentStatusResponse } from "../types";
import { usePaymentStatus, type FetchStatus } from "./use-payment-status";

/**
 * <YolaPaymentStatus />: a drop-in, dependency-free payment status panel.
 *
 * Styling is inline (no CSS framework needed). Text is English; `locale`
 * controls number and time formatting.
 */

export interface YolaPaymentStatusProps {
  paymentId: string;
  /** Your server endpoint that returns Yola's status JSON for this payment. */
  statusUrl?: string;
  /** Or provide a fetcher (used by the sample store and tests). */
  fetchStatus?: FetchStatus;
  /** Status to show before the first poll returns. */
  initialStatus?: PaymentStatus;
  /** Shown before the first poll; the server's values win afterwards. */
  network?: Network;
  amount?: string;
  currency?: "ZEC";
  pollInterval?: number;
  onStatusChange?: (next: PaymentStatusResponse, previous: PaymentStatus | null) => void;
  onConfirmed?: (status: PaymentStatusResponse) => void;
  appearance?: "dark" | "light";
  locale?: string;
  className?: string;
  style?: CSSProperties;
}

type Tone = "neutral" | "pending" | "progress" | "success" | "warning" | "danger";

const COPY: Record<PaymentStatus, { title: string; body: string; tone: Tone; help?: string }> = {
  created: { title: "Preparing payment", body: "The payment request is being set up.", tone: "neutral" },
  awaiting_payment: {
    title: "Waiting for payment",
    body: "Scan the QR code or open the payment link in your Zcash wallet.",
    tone: "pending",
  },
  payment_detected: {
    title: "Payment detected",
    body: "We can see your payment. It is not final until it has enough confirmations.",
    tone: "progress",
  },
  confirming: { title: "Confirming", body: "Your payment is in a block and gaining confirmations.", tone: "progress" },
  confirmed: { title: "Payment confirmed", body: "Thank you. Your payment is complete.", tone: "success" },
  overpaid: {
    title: "Payment confirmed",
    body: "We received more than the requested amount.",
    tone: "success",
    help: "The merchant will be in touch about the extra amount.",
  },
  underpaid: {
    title: "Partly paid",
    body: "Less than the requested amount has arrived.",
    tone: "warning",
    help: "Send the remaining amount to the same address before the request expires.",
  },
  expired: {
    title: "Payment request expired",
    body: "No complete payment arrived in time.",
    tone: "neutral",
    help: "Do not send funds to this request. Start a new checkout to get a fresh payment request.",
  },
  cancelled: {
    title: "Payment request cancelled",
    body: "The merchant cancelled this request.",
    tone: "neutral",
    help: "Do not send funds to this request.",
  },
  failed: {
    title: "Payment failed",
    body: "This payment request could not be completed.",
    tone: "danger",
    help: "Contact the merchant before trying again.",
  },
  verification_required: {
    title: "Being reviewed",
    body: "We could not verify this payment automatically.",
    tone: "warning",
    help: "No action is needed yet. The merchant will review it and contact you if needed.",
  },
};

const THEMES = {
  dark: {
    bg: "#11131A",
    border: "rgba(248,250,252,0.10)",
    text: "#F8FAFC",
    muted: "#9298A8",
    track: "rgba(248,250,252,0.10)",
    sim: { bg: "rgba(139,92,246,0.10)", border: "rgba(139,92,246,0.35)", text: "#C4B5FD" },
    test: { bg: "rgba(251,191,36,0.10)", border: "rgba(251,191,36,0.35)", text: "#FBBF24" },
    tone: {
      neutral: "#9298A8",
      pending: "#C4B5FD",
      progress: "#FBBF24",
      success: "#4ADE80",
      warning: "#FBBF24",
      danger: "#FB7185",
    } as Record<Tone, string>,
  },
  light: {
    bg: "#FFFFFF",
    border: "rgba(8,9,13,0.12)",
    text: "#08090D",
    muted: "#5B6170",
    track: "rgba(8,9,13,0.08)",
    sim: { bg: "rgba(109,40,217,0.07)", border: "rgba(109,40,217,0.30)", text: "#5B21B6" },
    test: { bg: "rgba(180,83,9,0.08)", border: "rgba(180,83,9,0.30)", text: "#92400E" },
    tone: {
      neutral: "#5B6170",
      pending: "#6D28D9",
      progress: "#B45309",
      success: "#15803D",
      warning: "#B45309",
      danger: "#BE123C",
    } as Record<Tone, string>,
  },
};

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduce;
}

function useNow(active: boolean) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const update = () => setNow(Date.now());
    const first = setTimeout(update, 0);
    const t = setInterval(update, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [active]);
  return now;
}

function trimAmount(fixed: string) {
  return fixed.includes(".") ? fixed.replace(/\.?0+$/, "") : fixed;
}

function countdown(ms: number) {
  if (ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function YolaPaymentStatus(props: YolaPaymentStatusProps) {
  const { paymentId, appearance = "dark", locale, className, style } = props;
  const t = THEMES[appearance];
  const reduce = useReducedMotion();
  const state = usePaymentStatus({
    paymentId,
    statusUrl: props.statusUrl,
    fetchStatus: props.fetchStatus,
    pollInterval: props.pollInterval,
    onStatusChange: props.onStatusChange,
    onConfirmed: props.onConfirmed,
  });
  const data = state.data;
  const status: PaymentStatus | null = data?.status ?? props.initialStatus ?? null;
  const network = data?.network ?? props.network;
  const amount = data?.amount ?? props.amount;
  const currency = props.currency ?? "ZEC";
  const unit = network === "testnet" ? "TAZ" : currency;
  const final = data?.final ?? false;
  const now = useNow(!final);
  const copy = status ? COPY[status] : null;
  const toneColor = copy ? t.tone[copy.tone] : t.muted;
  const simulated = data ? data.trust_level === "simulated" : network === "demo";

  const fmtTime = (ms: number) =>
    new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(ms);
  const fmtAmount = (fixed: string) => {
    const trimmed = trimAmount(fixed);
    const [whole, frac] = trimmed.split(".");
    const groupedWhole = new Intl.NumberFormat(locale, { useGrouping: true }).format(BigInt(whole));
    const decimal = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === "decimal")?.value ?? ".";
    return frac ? `${groupedWhole}${decimal}${frac}` : groupedWhole;
  };

  const transition = reduce ? "none" : "color 240ms ease, background-color 240ms ease, width 480ms cubic-bezier(.22,1,.36,1)";
  const box: CSSProperties = {
    fontFamily: "inherit",
    background: t.bg,
    color: t.text,
    border: `1px solid ${t.border}`,
    borderRadius: 14,
    padding: 20,
    display: "grid",
    gap: 14,
    ...style,
  };
  const mono: CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12.5 };

  const expiresIn = data && !final && now !== null ? Date.parse(data.expires_at) - now : null;
  const conf = data?.confirmations;

  return (
    <section className={className} style={box} aria-busy={state.loading || undefined} aria-label="Payment status">
      {simulated && (
        <div
          style={{
            ...mono,
            fontSize: 11,
            letterSpacing: 0.3,
            background: t.sim.bg,
            border: `1px solid ${t.sim.border}`,
            color: t.sim.text,
            borderRadius: 8,
            padding: "6px 10px",
          }}
        >
          SIMULATED — NO BLOCKCHAIN TRANSACTION
        </div>
      )}
      {network === "testnet" && !simulated && (
        <div
          style={{
            ...mono,
            fontSize: 11,
            background: t.test.bg,
            border: `1px solid ${t.test.border}`,
            color: t.test.text,
            borderRadius: 8,
            padding: "6px 10px",
          }}
        >
          ZCASH TESTNET — TEST FUNDS HAVE NO MONETARY VALUE
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <span
          aria-hidden
          style={{
            marginTop: 6,
            width: 10,
            height: 10,
            borderRadius: 999,
            flexShrink: 0,
            background: toneColor,
            transition,
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p role="status" aria-live="polite" style={{ margin: 0, fontWeight: 600, fontSize: 17, color: t.text }}>
            {copy ? copy.title : "Checking payment status"}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 14, lineHeight: 1.5, color: t.muted }}>
            {copy ? copy.body : "Loading the latest status from the server."}
          </p>
        </div>
        {amount && (
          <p style={{ margin: 0, fontWeight: 600, fontSize: 17, whiteSpace: "nowrap" }}>
            {fmtAmount(amount)} <span style={{ color: t.muted, fontWeight: 500, fontSize: 14 }}>{unit}</span>
          </p>
        )}
      </div>

      {conf && conf.required > 0 && (status === "confirming" || status === "payment_detected") && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: t.muted }}>
            <span>Confirmations</span>
            <span style={mono}>
              {Math.min(conf.observed, conf.required)} / {conf.required}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Confirmations"
            aria-valuemin={0}
            aria-valuemax={conf.required}
            aria-valuenow={Math.min(conf.observed, conf.required)}
            style={{ marginTop: 6, height: 6, borderRadius: 999, background: t.track, overflow: "hidden" }}
          >
            <div
              style={{
                height: "100%",
                width: `${Math.min(100, (conf.observed / conf.required) * 100)}%`,
                background: t.tone.progress,
                transition,
              }}
            />
          </div>
        </div>
      )}

      {copy?.help && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: t.text }}>{copy.help}</p>}

      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", fontSize: 13 }}>
        {data?.amount_received && (
          <>
            <dt style={{ color: t.muted }}>Received</dt>
            <dd style={{ margin: 0, textAlign: "right" }}>
              {fmtAmount(data.amount_received)} {unit}
            </dd>
          </>
        )}
        {expiresIn !== null && (
          <>
            <dt style={{ color: t.muted }}>Expires in</dt>
            <dd style={{ ...mono, margin: 0, textAlign: "right" }}>{countdown(expiresIn)}</dd>
          </>
        )}
        {data?.transaction_id && (
          <>
            <dt style={{ color: t.muted }}>{simulated ? "Simulated reference" : "Transaction"}</dt>
            <dd
              title={data.transaction_id}
              style={{ ...mono, margin: 0, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {data.transaction_id}
            </dd>
          </>
        )}
        {state.lastUpdated !== null && (
          <>
            <dt style={{ color: t.muted }}>Last checked</dt>
            <dd style={{ ...mono, margin: 0, textAlign: "right" }}>{fmtTime(state.lastUpdated)}</dd>
          </>
        )}
      </dl>

      {state.error && (
        <div
          role="alert"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            fontSize: 13,
            color: t.tone.danger,
            borderTop: `1px solid ${t.border}`,
            paddingTop: 12,
          }}
        >
          <span>
            {state.error} {state.failures > 1 ? "Retrying automatically." : ""}
          </span>
          <button
            type="button"
            onClick={state.refresh}
            style={{
              font: "inherit",
              fontSize: 13,
              color: t.text,
              background: "transparent",
              border: `1px solid ${t.border}`,
              borderRadius: 8,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            Retry now
          </button>
        </div>
      )}
    </section>
  );
}
