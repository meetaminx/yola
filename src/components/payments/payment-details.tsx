"use client";

import { Info } from "lucide-react";
import { PaymentQr } from "@/components/qr/payment-qr";
import { CopyButton } from "@/components/ui/copy-button";
import { formatZecTrimmed } from "@/lib/payments/amount";
import { isTerminal } from "@/lib/payments/state-machine";
import type { PaymentRequest } from "@/lib/payments/types";
import { timeOf } from "./payment-timeline";

export function formatRemaining(ms: number) {
  if (ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/**
 * QR code, amount and request facts for one payment request. Everything is
 * read from the payment record itself, never from form state.
 */
export function PaymentDetails({ payment, now }: { payment: PaymentRequest; now: number }) {
  const requested = BigInt(payment.amount_zatoshis);
  const received = payment.amount_received_zatoshis ? BigInt(payment.amount_received_zatoshis) : 0n;
  const simulated = payment.trust_level === "simulated";
  const live = !isTerminal(payment.status);
  const unit = payment.network === "testnet" ? "TAZ" : "ZEC";

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-[220px_minmax(0,1fr)]">
        <PaymentQr payload={payment.qr_payload} paymentId={payment.id} />
        <dl className="grid content-start gap-3 text-sm">
          <div>
            <dt className="text-muted">Amount</dt>
            <dd className="type-heading mt-0.5 text-3xl">
              {formatZecTrimmed(requested)} <span className="text-lg text-muted">{unit}</span>
            </dd>
            {received > 0n && (
              <dd className="mt-1 font-mono text-xs text-muted">
                received {formatZecTrimmed(received)} {unit}
                {simulated ? " (simulated)" : ""}
              </dd>
            )}
          </div>
          {payment.description && (
            <div>
              <dt className="text-muted">Description</dt>
              <dd className="mt-0.5 text-text">{payment.description}</dd>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <dt className="text-muted">Request ID</dt>
              <dd className="mt-0.5 truncate font-mono text-[13px] text-text" title={payment.id}>
                {payment.id}
              </dd>
            </div>
            <div>
              <dt className="text-muted">{live && now > 0 ? "Expires in" : "Expires"}</dt>
              <dd className="mt-0.5 font-mono text-[13px] tabular-nums text-text">
                {live && now > 0 ? formatRemaining(Date.parse(payment.expires_at) - now) : timeOf(payment.expires_at)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-muted">Destination</dt>
              <dd className="mt-0.5 truncate font-mono text-[13px] text-text" title={payment.destination}>
                {simulated ? "none (simulated)" : payment.destination}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Confirmations</dt>
              <dd className="mt-0.5 font-mono text-[13px] tabular-nums text-text">
                {payment.confirmations ? `${payment.confirmations.observed} / ${payment.confirmations.required}` : "none yet"}
              </dd>
            </div>
          </div>
          {payment.transaction_id && (
            <div className="min-w-0">
              <dt className="text-muted">{simulated ? "Simulated transaction reference" : "Transaction ID"}</dt>
              <dd className="mt-0.5 truncate font-mono text-[13px] text-text" title={payment.transaction_id}>
                {payment.transaction_id}
              </dd>
              {simulated && <dd className="mt-0.5 text-xs text-faint">Not a blockchain transaction hash.</dd>}
            </div>
          )}
        </dl>
      </div>

      <div className="rounded-xl border border-line bg-bg">
        <div className="flex items-center justify-between border-b border-line py-1 pr-1 pl-3">
          <span className="text-xs text-muted">QR payload</span>
          <CopyButton value={payment.qr_payload} label="payment payload" />
        </div>
        <p className="break-all px-3 py-2.5 font-mono text-[12.5px] text-text/85">{payment.qr_payload}</p>
        {simulated && (
          <p className="flex gap-2 border-t border-line px-3 py-2 text-xs text-muted">
            <Info className="mt-px size-3.5 shrink-0" />
            Simulator payloads use a yola-demo: scheme on purpose, so no wallet mistakes them for a real zcash: payment
            request.
          </p>
        )}
      </div>
    </>
  );
}
