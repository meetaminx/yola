import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/dashboard/page-header";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatZecTrimmed } from "@/lib/payments/amount";
import { STATUS_COPY } from "@/lib/payments/state-machine";
import { PAYMENT_STATUSES, type PaymentStatus } from "@/lib/payments/types";
import { loadDashboard } from "@/lib/server/dashboard";
import { db } from "@/lib/server/db";
import type { Prisma } from "@/generated/prisma/client";

export const metadata = { title: "Payments" };

const PAGE = 20;
const NETWORKS = ["demo", "testnet"] as const;

function fmt(d: Date) {
  return d.toISOString().replace("T", " ").slice(0, 16);
}

export default async function PaymentsPage({ searchParams }: PageProps<"/dashboard/payments">) {
  const { project } = await loadDashboard();
  if (!project) return <EmptyState title="No project selected" body="Create a project first." action={<ButtonLink href="/dashboard" size="sm">Create a project</ButtonLink>} />;

  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const status = PAYMENT_STATUSES.includes(one("status") as PaymentStatus) ? (one("status") as PaymentStatus) : undefined;
  const network = NETWORKS.includes(one("network") as (typeof NETWORKS)[number]) ? (one("network") as (typeof NETWORKS)[number]) : undefined;
  const q = one("q")?.trim().slice(0, 128) || undefined;
  const after = one("after");
  const before = one("before");

  const where: Prisma.PaymentRequestWhereInput = {
    projectId: project.id,
    ...(status ? { status } : {}),
    ...(network ? { network } : {}),
    ...(q ? { OR: [{ id: { startsWith: q } }, { externalReference: { contains: q, mode: "insensitive" } }] } : {}),
  };

  const cursorId = after ?? before;
  const cursor = cursorId ? await db().paymentRequest.findFirst({ where: { id: cursorId, projectId: project.id }, select: { id: true, createdAt: true } }) : null;
  const older = cursor && after ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {};
  const newer = cursor && before ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] } : {};
  const asc = Boolean(cursor && before);

  const rows = await db().paymentRequest.findMany({
    where: { AND: [where, older, newer] },
    orderBy: asc ? [{ createdAt: "asc" }, { id: "asc" }] : [{ createdAt: "desc" }, { id: "desc" }],
    take: PAGE + 1,
  });
  const extra = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  if (asc) page.reverse();
  const hasOlder = asc ? Boolean(cursor) : extra;
  const hasNewer = asc ? extra : Boolean(cursor && after);

  const base = new URLSearchParams();
  if (status) base.set("status", status);
  if (network) base.set("network", network);
  if (q) base.set("q", q);
  const link = (extraParams: Record<string, string>) => `/dashboard/payments?${new URLSearchParams({ ...Object.fromEntries(base), ...extraParams })}`;

  return (
    <>
      <PageHeader title="Payments" description="Every payment request in this project, newest first. Simulated payments are marked as such." />

      <form method="get" className="mb-5 flex flex-wrap items-end gap-3" role="search" aria-label="Filter payments">
        <div>
          <label htmlFor="q" className="mb-1.5 block text-xs text-muted">Search</label>
          <input id="q" name="q" defaultValue={q} placeholder="Payment ID or your reference" className="h-9 w-64 rounded-[var(--radius-control)] border border-line-strong bg-bg px-3 text-sm text-text outline-none placeholder:text-faint focus:border-brand" />
        </div>
        <div>
          <label htmlFor="status" className="mb-1.5 block text-xs text-muted">Status</label>
          <select id="status" name="status" defaultValue={status ?? ""} className="h-9 rounded-[var(--radius-control)] border border-line-strong bg-bg px-3 text-sm text-text outline-none focus:border-brand">
            <option value="">Any status</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_COPY[s].label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="network" className="mb-1.5 block text-xs text-muted">Network</label>
          <select id="network" name="network" defaultValue={network ?? ""} className="h-9 rounded-[var(--radius-control)] border border-line-strong bg-bg px-3 text-sm text-text outline-none focus:border-brand">
            <option value="">Any network</option>
            <option value="demo">Demo (simulated)</option>
            <option value="testnet">Testnet</option>
          </select>
        </div>
        <button type="submit" className={buttonClasses("secondary", "sm", "h-9")}>Apply</button>
        {(status || network || q) && (
          <Link href="/dashboard/payments" className="h-9 px-2 text-sm leading-9 text-muted hover:text-text">Clear filters</Link>
        )}
      </form>

      {page.length === 0 ? (
        <EmptyState
          title={status || network || q ? "No payments match these filters" : "No payment requests yet"}
          body={status || network || q ? "Try a different status, network or search." : "Create one from the playground or with the API."}
          action={<ButtonLink href="/dashboard/playground" size="sm">Open the playground</ButtonLink>}
        />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-line">
          <table className="w-full min-w-[960px] text-left text-sm [&_td]:whitespace-nowrap">
            <caption className="sr-only">Payment requests</caption>
            <thead className="bg-surface text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-normal">Payment ID</th>
                <th scope="col" className="px-4 py-3 text-right font-normal">Amount</th>
                <th scope="col" className="px-4 py-3 font-normal">Network</th>
                <th scope="col" className="px-4 py-3 font-normal">Status</th>
                <th scope="col" className="px-4 py-3 font-normal">Created (UTC)</th>
                <th scope="col" className="px-4 py-3 font-normal">Expires (UTC)</th>
                <th scope="col" className="px-4 py-3 font-normal">Transaction</th>
              </tr>
            </thead>
            <tbody>
              {page.map((p) => (
                <tr key={p.id} className="border-t border-line hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/payments/${p.id}`} className="font-mono text-[13px] text-brand-soft hover:underline">{p.id}</Link>
                    {p.externalReference && <p className="mt-0.5 text-xs text-muted">ref {p.externalReference}</p>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[13px] tabular-nums">{formatZecTrimmed(p.amountZatoshis)} {p.network === "testnet" ? "TAZ" : "ZEC"}</td>
                  <td className="px-4 py-3 text-muted">{p.network === "demo" ? "Simulated" : "Testnet"}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{fmt(p.createdAt)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{fmt(p.expiresAt)}</td>
                  <td className="max-w-[180px] truncate px-4 py-3 font-mono text-xs text-muted" title={p.transactionId ?? undefined}>
                    {p.transactionId ?? "none"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav aria-label="Pagination" className="mt-4 flex justify-between">
        {hasNewer ? <Link className={buttonClasses("secondary", "sm")} href={link({ before: page[0].id })}>Newer</Link> : <span />}
        {hasOlder ? <Link className={buttonClasses("secondary", "sm")} href={link({ after: page[page.length - 1].id })}>Older</Link> : <span />}
      </nav>
    </>
  );
}
