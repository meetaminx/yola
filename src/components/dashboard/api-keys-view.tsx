"use client";

import { AlertTriangle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { createApiKeyAction, revokeApiKeyAction } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import { EmptyState, PageHeader } from "./page-header";

export interface KeyRow {
  id: string;
  name: string;
  mode: "test" | "live";
  masked: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const date = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "Never");

export function ApiKeysView({ projectId, keys }: { projectId: string; keys: KeyRow[] }) {
  const ids = { name: useId(), nameErr: useId() };
  const [createOpen, setCreateOpen] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [revoking, setRevoking] = useState<KeyRow | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    start(async () => {
      const r = await createApiKeyAction(projectId, { name: String(f.get("name") ?? ""), mode: String(f.get("mode") ?? "test") });
      if (!r.ok) {
        setErrors(r.fields ?? { _: r.error });
        return;
      }
      setErrors({});
      setCreateOpen(false);
      setSaved(false);
      setSecret(r.secret);
      router.refresh();
    });
  }

  function revoke(key: KeyRow) {
    start(async () => {
      const r = await revokeApiKeyAction(projectId, key.id);
      setRevoking(null);
      toast(r.ok ? { tone: "success", message: `Key "${key.name}" revoked` } : { tone: "error", message: r.error });
      router.refresh();
    });
  }

  const active = keys.filter((k) => !k.revokedAt);
  const revoked = keys.filter((k) => k.revokedAt);

  return (
    <>
      <PageHeader
        title="API keys"
        description="Secret keys authenticate your server to the Yola API. Keep them in server-side environment variables. Never put one in browser code or a public repository."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden /> Create key
          </Button>
        }
      />

      {active.length === 0 ? (
        <EmptyState title="No active keys" body="Create a test key to call the API from your server." action={<Button size="sm" onClick={() => setCreateOpen(true)}>Create a test key</Button>} />
      ) : (
        <KeyTable keys={active} onRevoke={setRevoking} />
      )}

      {revoked.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm text-muted hover:text-text">Revoked keys ({revoked.length})</summary>
          <div className="mt-3">
            <KeyTable keys={revoked} />
          </div>
        </details>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create an API key" description="The secret is shown once, right after creation.">
        <form onSubmit={create} noValidate className="flex flex-col gap-5">
          <Field label="Name" htmlFor={ids.name} error={errors.name} errorId={ids.nameErr} hint="Where the key is used, e.g. “Checkout server (staging)”.">
            <Input id={ids.name} name="name" maxLength={60} required aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? ids.nameErr : undefined} />
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm text-text">Environment</legend>
            <div className="grid gap-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line-strong p-3 has-[:checked]:border-brand">
                <input type="radio" name="mode" value="test" defaultChecked className="mt-1 accent-[#8B5CF6]" />
                <span>
                  <span className="block text-sm text-text">Test key</span>
                  <span className="block text-xs text-muted">Creates demo (simulated) and testnet payment requests. Starts with ysk_test_.</span>
                </span>
              </label>
              <label className="flex cursor-not-allowed items-start gap-3 rounded-lg border border-line p-3 opacity-60">
                <input type="radio" name="mode" value="live" disabled className="mt-1" />
                <span>
                  <span className="block text-sm text-text">Live key</span>
                  <span className="block text-xs text-muted">Unavailable: mainnet is disabled until its verification path has been reviewed.</span>
                </span>
              </label>
            </div>
          </fieldset>
          {errors._ && <p role="alert" className="text-sm text-danger">{errors._}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" loading={pending}>Create key</Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={secret !== null}
        onClose={() => setSecret(null)}
        dismissible={false}
        title="Save your secret key"
        description="This is the only time Yola shows it. Yola stores a one-way hash, so it cannot be recovered. If you lose it, revoke it and create another."
      >
        {secret && (
          <div className="flex flex-col gap-5">
            <div className="rounded-lg border border-line bg-bg">
              <div className="flex items-center justify-between border-b border-line py-1 pr-1 pl-3">
                <span className="text-xs text-muted">Secret key</span>
                <CopyButton value={secret} label="secret key" />
              </div>
              <p className="break-all px-3 py-3 font-mono text-[13px] text-text" data-testid="new-secret">
                {secret}
              </p>
            </div>
            <p className="flex gap-2 text-xs text-warning">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
              Put it in your server&apos;s environment as YOLA_SECRET_KEY. Never commit it or use it in browser code.
            </p>
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="accent-[#8B5CF6]" />
              I have stored this key somewhere safe
            </label>
            <div className="flex justify-end">
              <Button size="sm" disabled={!saved} onClick={() => setSecret(null)}>Done</Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title={`Revoke "${revoking?.name ?? ""}"?`}
        description="Requests using this key will fail with api_key_revoked immediately. This cannot be undone."
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setRevoking(null)}>Keep key</Button>
          <Button size="sm" loading={pending} onClick={() => revoking && revoke(revoking)} className="bg-danger shadow-none hover:bg-danger/90">
            Revoke key
          </Button>
        </div>
      </Dialog>
    </>
  );
}

function KeyTable({ keys, onRevoke }: { keys: KeyRow[]; onRevoke?: (k: KeyRow) => void }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-panel)] border border-line">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-surface text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-normal">Name</th>
            <th scope="col" className="px-4 py-3 font-normal">Key</th>
            <th scope="col" className="px-4 py-3 font-normal">Created</th>
            <th scope="col" className="px-4 py-3 font-normal">{onRevoke ? "Last used" : "Revoked"}</th>
            <th scope="col" className="px-4 py-3 font-normal"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id} className={cn("border-t border-line", k.revokedAt && "text-muted")}>
              <td className="px-4 py-3">
                <span className="text-text">{k.name}</span>
                <span className="ml-2 rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted">{k.mode}</span>
              </td>
              <td className="px-4 py-3 font-mono text-[13px]">{k.masked}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted">{date(k.createdAt)}</td>
              <td className="px-4 py-3 font-mono text-xs text-muted">{date(onRevoke ? k.lastUsedAt : k.revokedAt)}</td>
              <td className="px-4 py-3 text-right">
                {onRevoke && (
                  <Button size="sm" variant="ghost" onClick={() => onRevoke(k)} aria-label={`Revoke ${k.name}`}>
                    Revoke
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
