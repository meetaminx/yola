"use client";

import { KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { removeViewingKeyAction, saveViewingKeyAction } from "@/app/dashboard/viewing-key-actions";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Field, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";

/**
 * Testnet viewing key. Only offered when the scanner is reachable, because
 * without it nothing could validate the key or watch for payments.
 */
export function ViewingKeyPanel({
  projectId,
  canEdit,
  testnet,
  current,
}: {
  projectId: string;
  canEdit: boolean;
  testnet: "available" | "unreachable" | "not_configured" | "disabled";
  current: { fingerprint: string; createdAt: string; birthdayHeight: number | null } | null;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ firstAddress: string; reduced: boolean } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const value = String(new FormData(form).get("viewingKey") ?? "");
    start(async () => {
      const r = await saveViewingKeyAction(projectId, value);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      form.reset();
      setError(null);
      setSaved({ firstAddress: r.firstAddress, reduced: r.reducedFromFullKey });
      toast({ tone: "success", message: "Viewing key saved" });
      router.refresh();
    });
  }

  function remove() {
    start(async () => {
      const r = await removeViewingKeyAction(projectId);
      setConfirmRemove(false);
      if (!r.ok) {
        toast({ tone: "error", message: r.error });
        return;
      }
      setSaved(null);
      toast({ tone: "success", message: "Viewing key removed" });
      router.refresh();
    });
  }

  if (current) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3 rounded-xl border border-line bg-bg p-4 text-sm">
          <KeyRound className="mt-0.5 size-4 shrink-0 text-signal" aria-hidden />
          <div className="min-w-0">
            <p className="text-text">Incoming viewing key stored, encrypted</p>
            <p className="mt-0.5 font-mono text-xs text-muted">
              fingerprint {current.fingerprint}
              {current.birthdayHeight !== null && <>, watching from block {current.birthdayHeight.toLocaleString("en-US")}</>}
            </p>
          </div>
        </div>
        {saved && (
          <div className="rounded-xl border border-line bg-bg p-4 text-sm text-muted">
            <p className="text-text">Check it is the right wallet</p>
            <p className="mt-1">
              Your wallet&apos;s default unified address for this key should be the one below.
              {saved.reduced && " You pasted a full viewing key; Yola kept only its incoming part."}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 truncate font-mono text-xs text-text">{saved.firstAddress}</code>
              <CopyButton value={saved.firstAddress} label="Copy address" />
            </div>
          </div>
        )}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            {confirmRemove ? (
              <>
                <span className="text-sm text-muted">Remove the key? New testnet requests will be refused until you add one.</span>
                <Button size="sm" variant="secondary" className="text-danger" loading={pending} onClick={remove}>Remove key</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>Keep it</Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setConfirmRemove(true)}>Remove key</Button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (testnet !== "available") {
    return (
      <div className="rounded-xl border border-line bg-bg p-4 text-sm text-muted">
        <p className="text-text">{testnet === "unreachable" ? "The testnet scanner is not reachable right now." : "Not available on this server yet."}</p>
        <p className="mt-1">
          {testnet === "unreachable"
            ? "Keys can be added once the scanner answers its health check."
            : "Testnet is not configured, so there is nothing that could validate a viewing key or watch for payments. The operator needs to run the Yola scanner against a testnet lightwalletd or Zaino server."}{" "}
          <Link href="/docs/testnet" className="text-brand-soft hover:underline">What testnet needs</Link>
        </p>
      </div>
    );
  }

  if (!canEdit) return <p className="text-sm text-muted">No viewing key yet. A project owner can add one.</p>;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field
        label="Unified viewing key (testnet)"
        htmlFor={id}
        error={error ?? undefined}
        hint="Starts with uviewtest1 (full) or uivktest1 (incoming). Export it from your wallet's settings. Yola stores only the incoming part, encrypted."
      >
        <Textarea
          id={id}
          name="viewingKey"
          rows={3}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="font-mono text-xs"
          aria-invalid={error ? true : undefined}
        />
      </Field>
      <div>
        <Button type="submit" loading={pending}>Save viewing key</Button>
      </div>
    </form>
  );
}
