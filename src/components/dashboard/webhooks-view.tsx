"use client";

import { AlertTriangle, Plus, RotateCw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import {
  createWebhookEndpointAction,
  deleteWebhookEndpointAction,
  redeliverAction,
  rotateWebhookSecretAction,
  sendTestEventAction,
  setWebhookEnabledAction,
} from "@/app/dashboard/webhook-actions";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhooks/events";
import { EmptyState, PageHeader } from "./page-header";

export interface EndpointRow {
  id: string;
  url: string;
  description: string | null;
  eventTypes: string[];
  enabled: boolean;
  createdAt: string;
}

export interface DeliveryRow {
  id: string;
  eventId: string;
  eventType: string;
  endpointUrl: string;
  status: "pending" | "delivering" | "succeeded" | "failed";
  attemptCount: number;
  lastStatusCode: number | null;
  lastError: string | null;
  nextAttemptAt: string;
  createdAt: string;
  attempts: { attempt: number; startedAt: string; durationMs: number; statusCode: number | null; error: string | null }[];
}

const time = (iso: string) => new Date(iso).toISOString().replace("T", " ").slice(0, 19) + " UTC";
const STATUS_TONE = { succeeded: "text-success", failed: "text-danger", pending: "text-muted", delivering: "text-warning" } as const;

export function WebhooksView({ projectId, endpoints, deliveries }: { projectId: string; endpoints: EndpointRow[]; deliveries: DeliveryRow[] }) {
  const ids = { url: useId(), desc: useId(), urlErr: useId() };
  const [adding, setAdding] = useState(false);
  const [allEvents, setAllEvents] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [secret, setSecret] = useState<{ value: string; title: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "delete" | "rotate"; endpoint: EndpointRow } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function run<T extends { ok: boolean; error?: string }>(fn: () => Promise<T>, onOk?: (r: T) => void) {
    start(async () => {
      const r = await fn();
      if (!r.ok) toast({ tone: "error", message: r.error ?? "That did not work." });
      else onOk?.(r);
      router.refresh();
    });
  }

  function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const eventTypes = allEvents ? [] : (f.getAll("events") as string[]);
    if (!allEvents && eventTypes.length === 0) {
      setErrors({ events: "Choose at least one event, or receive all events." });
      return;
    }
    start(async () => {
      const r = await createWebhookEndpointAction(projectId, { url: String(f.get("url") ?? ""), description: String(f.get("description") ?? ""), eventTypes });
      if (!r.ok) {
        setErrors(r.fields ?? { _: r.error });
        return;
      }
      setErrors({});
      setAdding(false);
      setSecret({ value: r.secret, title: "Save the signing secret" });
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Yola sends a signed POST to your endpoints when a payment's status changes. Verify the signature, then act. Fulfil orders only on payment_request.confirmed with a verified trust level."
        actions={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> Add endpoint
          </Button>
        }
      />

      <section aria-labelledby="ep-title">
        <h2 id="ep-title" className="mb-3 text-[15px] text-text">Endpoints</h2>
        {endpoints.length === 0 ? (
          <EmptyState title="No endpoints yet" body="Add an HTTPS URL on your server. Yola will sign every request with a secret only you and Yola know." action={<Button size="sm" onClick={() => setAdding(true)}>Add endpoint</Button>} />
        ) : (
          <ul className="flex flex-col gap-3">
            {endpoints.map((e) => (
              <li key={e.id} className="panel flex flex-wrap items-start justify-between gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-[13px] text-text">{e.url}</p>
                  <p className="mt-1 text-xs text-muted">
                    {e.description ? `${e.description}. ` : ""}
                    {e.eventTypes.length === 0 ? "All events" : `${e.eventTypes.length} event type${e.eventTypes.length === 1 ? "" : "s"}`}
                    {", "}
                    <span className={e.enabled ? "text-success" : "text-warning"}>{e.enabled ? "enabled" : "disabled"}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="secondary" disabled={pending || !e.enabled} onClick={() => run(() => sendTestEventAction(projectId, e.id), () => toast({ tone: "success", message: "Test event queued. Its result appears under Deliveries." }))}>
                    <Send className="size-3.5" aria-hidden /> Send test event
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setWebhookEnabledAction(projectId, e.id, !e.enabled), () => toast({ tone: "success", message: e.enabled ? "Endpoint disabled" : "Endpoint enabled" }))}>
                    {e.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirm({ kind: "rotate", endpoint: e })}>
                    Rotate secret
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirm({ kind: "delete", endpoint: e })} className="text-danger hover:text-danger">
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="del-title" className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="del-title" className="text-[15px] text-text">Deliveries</h2>
          <Button size="sm" variant="ghost" onClick={() => router.refresh()}>
            <RotateCw className="size-3.5" aria-hidden /> Refresh
          </Button>
        </div>
        {deliveries.length === 0 ? (
          <p className="text-sm text-muted">No deliveries yet. Send a test event, or create a payment request in the playground.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-[var(--radius-panel)] border border-line">
            {deliveries.map((d) => (
              <li key={d.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-white/[0.02]">
                    <span className={cn("w-20 font-mono text-xs", STATUS_TONE[d.status])}>{d.status}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-text">{d.eventType}</span>
                    <span className="hidden max-w-[260px] truncate font-mono text-xs text-muted md:inline">{d.endpointUrl}</span>
                    <span className="font-mono text-xs text-muted">
                      {d.lastStatusCode ? `HTTP ${d.lastStatusCode}` : d.attemptCount ? "no response" : "not sent yet"}
                    </span>
                    <span className="font-mono text-xs text-faint">{time(d.createdAt)}</span>
                  </summary>
                  <div className="border-t border-line bg-bg/50 px-4 py-3 text-xs">
                    <p className="text-muted">
                      Event <span className="font-mono text-text">{d.eventId}</span>, delivery <span className="font-mono text-text">{d.id}</span>
                    </p>
                    {d.status === "pending" && d.attemptCount > 0 && <p className="mt-1 text-muted">Next attempt at {time(d.nextAttemptAt)}.</p>}
                    {d.attempts.length > 0 ? (
                      <table className="mt-3 w-full text-left">
                        <thead className="text-faint">
                          <tr>
                            <th className="py-1 font-normal">#</th>
                            <th className="py-1 font-normal">Started</th>
                            <th className="py-1 font-normal">Result</th>
                            <th className="py-1 text-right font-normal">Time</th>
                          </tr>
                        </thead>
                        <tbody className="font-mono">
                          {d.attempts.map((a) => (
                            <tr key={a.attempt}>
                              <td className="py-1 text-muted">{a.attempt}</td>
                              <td className="py-1 text-muted">{time(a.startedAt)}</td>
                              <td className={cn("py-1", a.error ? "text-danger" : "text-success")}>{a.error ?? `HTTP ${a.statusCode}`}</td>
                              <td className="py-1 text-right text-muted">{a.durationMs} ms</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="mt-2 text-muted">No attempts yet.</p>
                    )}
                    {(d.status === "failed" || d.status === "succeeded") && (
                      <Button size="sm" variant="secondary" className="mt-3" disabled={pending} onClick={() => run(() => redeliverAction(projectId, d.id), () => toast({ tone: "success", message: "Delivery queued again" }))}>
                        {d.status === "failed" ? "Retry now" : "Send again"}
                      </Button>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add a webhook endpoint" description="Use an HTTPS URL on your server. Private and internal addresses are rejected.">
        <form onSubmit={add} noValidate className="flex flex-col gap-5">
          <Field label="Endpoint URL" htmlFor={ids.url} error={errors.url} errorId={ids.urlErr}>
            <Input id={ids.url} name="url" type="url" placeholder="https://shop.example.com/api/webhooks/yola" required aria-invalid={errors.url ? true : undefined} aria-describedby={errors.url ? ids.urlErr : undefined} />
          </Field>
          <Field label={<>Description <span className="text-muted">(optional)</span></>} htmlFor={ids.desc} error={errors.description}>
            <Input id={ids.desc} name="description" maxLength={120} />
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm text-text">Events</legend>
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={allEvents} onChange={(e) => setAllEvents(e.target.checked)} className="accent-[#8B5CF6]" />
              Receive all events
            </label>
            {!allEvents && (
              <div className="mt-3 grid max-h-48 gap-1.5 overflow-y-auto rounded-lg border border-line p-3 sm:grid-cols-2">
                {WEBHOOK_EVENT_TYPES.filter((t) => t !== "webhook.test").map((t) => (
                  <label key={t} className="flex items-center gap-2 font-mono text-xs text-text">
                    <input type="checkbox" name="events" value={t} className="accent-[#8B5CF6]" />
                    {t.replace("payment_request.", "")}
                  </label>
                ))}
              </div>
            )}
            {errors.events && <p role="alert" className="mt-1.5 text-[13px] text-danger">{errors.events}</p>}
          </fieldset>
          {errors._ && <p role="alert" className="text-sm text-danger">{errors._}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" size="sm" loading={pending}>Add endpoint</Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === "delete" ? "Delete this endpoint?" : "Rotate the signing secret?"}
        description={
          confirm?.kind === "delete"
            ? "Pending deliveries to it are discarded. This cannot be undone."
            : "The old secret stops working for new deliveries immediately. Update your server before or right after rotating."
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            size="sm"
            loading={pending}
            onClick={() => {
              if (!confirm) return;
              const { kind, endpoint } = confirm;
              setConfirm(null);
              if (kind === "delete") run(() => deleteWebhookEndpointAction(projectId, endpoint.id), () => toast({ tone: "success", message: "Endpoint deleted" }));
              else run(() => rotateWebhookSecretAction(projectId, endpoint.id), (r) => setSecret({ value: (r as unknown as { secret: string }).secret, title: "Save the new signing secret" }));
            }}
          >
            {confirm?.kind === "delete" ? "Delete endpoint" : "Rotate secret"}
          </Button>
        </div>
      </Dialog>

      <Dialog open={secret !== null} onClose={() => setSecret(null)} dismissible={false} title={secret?.title ?? ""} description="Shown once. Yola keeps it encrypted to sign deliveries, but will not display it again.">
        {secret && (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-line bg-bg">
              <div className="flex items-center justify-between border-b border-line py-1 pr-1 pl-3">
                <span className="text-xs text-muted">Signing secret</span>
                <CopyButton value={secret.value} label="signing secret" />
              </div>
              <p className="break-all px-3 py-3 font-mono text-[13px] text-text" data-testid="new-signing-secret">{secret.value}</p>
            </div>
            <p className="flex gap-2 text-xs text-warning">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
              Store it as YOLA_WEBHOOK_SECRET on the server that receives the webhooks.
            </p>
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setSecret(null)}>I have saved it</Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
