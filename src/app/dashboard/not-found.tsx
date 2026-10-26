import Link from "next/link";

export default function DashboardNotFound() {
  return (
    <div className="max-w-[56ch] py-10">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">404</p>
      <h1 className="type-heading mt-3 text-3xl">Not found</h1>
      <p className="mt-3 leading-relaxed text-muted">
        Nothing with that ID exists in your projects. It may belong to another project or account, or the link may be
        mistyped.
      </p>
      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <Link href="/dashboard/payments" className="text-brand-soft hover:underline">Payments</Link>
        <Link href="/dashboard" className="text-brand-soft hover:underline">Overview</Link>
      </div>
    </div>
  );
}
