import { KeyRound } from "lucide-react";
import Link from "next/link";

/**
 * Viewing-key status. Adding a key needs a configured testnet backend that
 * can validate it and derive addresses from it, so without one this panel
 * explains what is missing instead of offering a form that would do nothing.
 */
export function ViewingKeyPanel({
  testnetEnabled,
  current,
}: {
  projectId: string;
  canEdit: boolean;
  testnetEnabled: boolean;
  current: { fingerprint: string; createdAt: string; birthdayHeight: number | null } | null;
}) {
  if (current) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-line bg-bg p-4 text-sm">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
        <div>
          <p className="text-text">Viewing key stored (encrypted)</p>
          <p className="mt-0.5 font-mono text-xs text-muted">fingerprint {current.fingerprint}</p>
        </div>
      </div>
    );
  }
  if (!testnetEnabled) {
    return (
      <div className="rounded-xl border border-line bg-bg p-4 text-sm text-muted">
        <p className="text-text">Not available on this server yet.</p>
        <p className="mt-1">
          Testnet is disabled, so there is nothing that could validate a viewing key or watch for payments. The operator needs
          a Zebra node, a Zaino indexer and the Yola scanner.{" "}
          <Link href="/docs/testnet" className="text-brand-soft hover:underline">
            What testnet needs
          </Link>
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-line bg-bg p-4 text-sm text-muted">
      <p className="text-text">Testnet is enabled, but the scanner has not reported that it can accept viewing keys.</p>
      <p className="mt-1">Check the health endpoint. Keys can be added once the scanner is reachable.</p>
    </div>
  );
}
