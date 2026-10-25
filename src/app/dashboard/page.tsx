import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { CreateProjectForm } from "@/components/dashboard/create-project-form";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatZecTrimmed } from "@/lib/payments/amount";
import type { PaymentStatus } from "@/lib/payments/types";
import { loadDashboard } from "@/lib/server/dashboard";
import { db } from "@/lib/server/db";

export const metadata = { title: "Overview" };

const OPEN: PaymentStatus[] = ["created", "awaiting_payment", "payment_detected", "confirming", "underpaid", "verification_required"];
const FAILED: PaymentStatus[] = ["expired", "cancelled", "failed"];

async function loadOverview(projectId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return Promise.all([
    db().paymentRequest.groupBy({ by: ["status", "network"], where: { projectId }, _count: { _all: true } }),
    db().paymentRequest.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 6 }),
    db().webhookDelivery.groupBy({ by: ["status"], where: { projectId, createdAt: { gte: since } }, _count: { _all: true } }),
    db().apiKey.count({ where: { projectId, revokedAt: null } }),
    db().webhookEndpoint.count({ where: { projectId, enabled: true } }),
  ]);
}

export default async function OverviewPage() {
  const { user, project } = await loadDashboard();

  if (!project) {
    return (
      <>
        <PageHeader title={`Welcome, ${user.name.split(" ")[0] || "there"}`} description="Create a project to get test API keys, try the simulator and configure webhooks." />
        <section className="panel max-w-xl p-6">
          <h2 className="type-heading mb-5 text-lg">Create your first project</h2>
          <CreateProjectForm />
        </section>
      </>
    );
  }

  const [byStatus, recent, deliveries, activeKeys, endpoints] = await loadOverview(project.id);

  const count = (pred: (r: (typeof byStatus)[number]) => boolean) => byStatus.filter(pred).reduce((n, r) => n + r._count._all, 0);
  const total = count(() => true);
  const simulated = count((r) => r.network === "demo");
  const metrics = [
    { label: "Payment requests", value: total },
    { label: "Confirmed", value: count((r) => r.status === "confirmed" || r.status === "overpaid") },
    { label: "Open", value: count((r) => OPEN.includes(r.status)) },
    { label: "Expired, cancelled or failed", value: count((r) => FAILED.includes(r.status)) },
  ];
  const delivered = (s: string) => deliveries.find((d) => d.status === s)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
        actions={
          <>
            <ButtonLink href="/dashboard/playground" size="sm">
              Create a test payment
            </ButtonLink>
            <ButtonLink href="/dashboard/developers/api-keys" size="sm" variant="secondary">
              API keys
            </ButtonLink>
          </>
        }
      />

      <section aria-labelledby="metrics-title">
        <h2 id="metrics-title" className="sr-only">
          Payment counts
        </h2>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line lg:grid-cols-4">
          {metrics.map((m) => (
            <div key={m.label} className="bg-surface p-5">
              <dt className="text-sm text-muted">{m.label}</dt>
              <dd className="type-heading mt-2 text-3xl tabular-nums">{m.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-faint">
          {simulated === total
            ? "All counts are simulated payments on the demo network. None involved a blockchain."
            : `${simulated} of ${total} are simulated payments on the demo network; the rest are testnet.`}
        </p>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <section aria-labelledby="recent-title" className="panel min-w-0 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="recent-title" className="text-[15px] text-text">
              Recent payment requests
            </h2>
            <Link href="/dashboard/payments" className="text-sm text-brand-soft hover:underline">
              View all
            </Link>
          </div>
          {recent.length === 0 ? (
            <EmptyState
              title="No payment requests yet"
              body="Create one from the playground, or with your test key and the SDK."
              action={<ButtonLink href="/dashboard/playground" size="sm">Open the playground</ButtonLink>}
            />
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((p) => (
                <li key={p.id}>
                  <Link href={`/dashboard/payments/${p.id}`} className="flex items-center gap-4 py-3 text-sm hover:bg-white/[0.02]">
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-text">{p.id}</span>
                    <span className="hidden font-mono text-[13px] text-muted sm:inline">{formatZecTrimmed(p.amountZatoshis)} ZEC</span>
                    <StatusBadge status={p.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="setup-title" className="panel p-5">
          <h2 id="setup-title" className="mb-4 text-[15px] text-text">
            Integration status
          </h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Environment</dt>
              <dd className="text-text">Test (demo, testnet)</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Active API keys</dt>
              <dd className="text-text tabular-nums">{activeKeys}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Webhook endpoints</dt>
              <dd className="text-text tabular-nums">{endpoints}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Deliveries (24 h)</dt>
              <dd className="text-right tabular-nums">
                <span className="text-success">{delivered("succeeded")} delivered</span>,{" "}
                <span className={delivered("failed") ? "text-danger" : "text-muted"}>{delivered("failed")} failed</span>,{" "}
                <span className="text-muted">{delivered("pending") + delivered("delivering")} pending</span>
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 text-sm">
            {activeKeys === 0 && (
              <Link href="/dashboard/developers/api-keys" className="flex items-center justify-between text-brand-soft hover:underline">
                Create a test API key <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            )}
            {endpoints === 0 && (
              <Link href="/dashboard/developers/webhooks" className="flex items-center justify-between text-brand-soft hover:underline">
                Add a webhook endpoint <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            )}
            <Link href="/docs/quickstart" className="flex items-center justify-between text-muted hover:text-text">
              Read the quickstart <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
