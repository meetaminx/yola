import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentDetailClient } from "@/components/dashboard/payment-actions";
import { PageHeader } from "@/components/dashboard/page-header";
import { EnvironmentBadge, StatusBadge } from "@/components/ui/status-badge";
import { ApiError } from "@/lib/api/errors";
import { formatZecTrimmed } from "@/lib/payments/amount";
import { STATUS_COPY } from "@/lib/payments/state-machine";
import { loadDashboard } from "@/lib/server/dashboard";
import { db } from "@/lib/server/db";
import { serverPaymentService } from "@/lib/server/payments";

export const metadata = { title: "Payment" };

export default async function PaymentDetailPage({ params }: PageProps<"/dashboard/payments/[id]">) {
  const { project } = await loadDashboard();
  if (!project) notFound();
  const { id } = await params;

  // Through the service, so an overdue request is expired before it is shown.
  let payment;
  try {
    payment = (await serverPaymentService().retrieve({ projectId: project.id, allowedNetworks: ["demo", "testnet"] }, id)).body;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  const [observations, deliveries] = await Promise.all([
    db().paymentObservation.findMany({ where: { paymentRequestId: id, projectId: project.id }, orderBy: { observedAt: "asc" } }),
    db().webhookDelivery.findMany({
      where: { projectId: project.id, event: { paymentRequestId: id } },
      include: { event: { select: { type: true } }, endpoint: { select: { url: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <>
      <Link href="/dashboard/payments" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> Payments
      </Link>
      <PageHeader
        title={`${formatZecTrimmed(BigInt(payment.amount_zatoshis))} ${payment.network === "testnet" ? "TAZ" : "ZEC"}`}
        description={STATUS_COPY[payment.status].detail}
        actions={<StatusBadge status={payment.status} />}
      />
      <div className="mb-6">
        <EnvironmentBadge env={payment.trust_level === "simulated" ? "simulated" : "testnet"} />
      </div>

      <PaymentDetailClient projectId={project.id} payment={payment} />

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="obs-title" className="panel min-w-0 p-5">
          <h2 id="obs-title" className="mb-1 text-[15px] text-text">Network observations</h2>
          <p className="mb-4 text-xs text-muted">Outputs the verification backend saw paying this request&apos;s address.</p>
          {payment.trust_level === "simulated" ? (
            <p className="text-sm text-muted">None. Simulated payments are never observed on a network.</p>
          ) : observations.length === 0 ? (
            <p className="text-sm text-muted">Nothing observed yet.</p>
          ) : (
            <ul className="divide-y divide-line font-mono text-xs">
              {observations.map((o) => (
                <li key={o.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="truncate text-text" title={o.txid}>{o.txid.slice(0, 16)}… #{o.outputIndex} ({o.pool})</span>
                  <span className="text-muted">
                    {formatZecTrimmed(o.valueZatoshis)} TAZ, {o.blockHeight ? `block ${o.blockHeight}` : "mempool"}
                    {o.invalidatedAt ? ", reorged out" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="hook-title" className="panel min-w-0 p-5">
          <h2 id="hook-title" className="mb-1 text-[15px] text-text">Webhook deliveries</h2>
          <p className="mb-4 text-xs text-muted">One per event per endpoint.</p>
          {deliveries.length === 0 ? (
            <p className="text-sm text-muted">
              None. <Link href="/dashboard/developers/webhooks" className="text-brand-soft hover:underline">Add an endpoint</Link> to receive events.
            </p>
          ) : (
            <ul className="divide-y divide-line text-xs">
              {deliveries.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-mono text-text">{d.event.type}</span>
                  <span className={d.status === "succeeded" ? "text-success" : d.status === "failed" ? "text-danger" : "text-muted"}>
                    {d.status}
                    {d.lastStatusCode ? ` (HTTP ${d.lastStatusCode})` : ""}, {d.attemptCount} attempt{d.attemptCount === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
