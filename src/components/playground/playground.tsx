"use client";

import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, History, Loader2, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { panelSwap, transition } from "@/components/motion/tokens";
import { PaymentDetails } from "@/components/payments/payment-details";
import { PaymentTimeline } from "@/components/payments/payment-timeline";
import { SimulatorControls } from "@/components/payments/simulator-controls";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import { EnvironmentBadge } from "@/components/ui/status-badge";
import { createLocalGateway, parseJsonBody, type Gateway, type GatewayResponse, type RecordedEvent } from "@/lib/api/local-gateway";
import {
  generateSnippet,
  SNIPPET_LANGUAGES,
  type Operation,
  type SnippetLanguage,
} from "@/lib/content/request-snippets";
import type { SimulateAction } from "@/lib/payments/demo-adapter";
import type { PaymentRequest, PaymentStatusResponse } from "@/lib/payments/types";
import { cn } from "@/lib/utils/cn";
import { prefixedId, randomToken } from "@/lib/utils/ids";
import { TESTNET_ADAPTER_UNCONFIGURED } from "@/lib/zcash/adapter";
import { YolaPaymentStatus } from "@yola/sdk/react";

type Env = "demo" | "testnet";

interface Draft {
  operation: Operation;
  method: "GET" | "POST";
  path: string;
  bodyText: string;
  idempotencyKey: string;
}

interface HistoryEntry {
  id: string;
  draft: Draft;
  response: GatewayResponse;
  at: number;
}

const OPERATIONS: { id: Operation; label: string; method: "GET" | "POST"; needsId: boolean }[] = [
  { id: "create", label: "Create payment request", method: "POST", needsId: false },
  { id: "retrieve", label: "Retrieve payment request", method: "GET", needsId: true },
  { id: "status", label: "Get payment status", method: "GET", needsId: true },
  { id: "list", label: "List payment requests", method: "GET", needsId: false },
  { id: "cancel", label: "Cancel payment request", method: "POST", needsId: true },
  { id: "simulate", label: "Simulate wallet or network", method: "POST", needsId: true },
];

const PLACEHOLDER_ID = "pay_demo_xxxxxxxxxxxxxxxxxxxx";

function createBody(env: Env, overrides: Record<string, unknown> = {}) {
  return {
    amount: "0.25",
    currency: "ZEC",
    network: env,
    description: "Order 1042",
    external_reference: "1042",
    expires_in: 900,
    metadata: { channel: "web" },
    ...overrides,
  };
}

function template(op: Operation, env: Env, paymentId: string | null, fixedKey?: string): Draft {
  const id = paymentId ?? PLACEHOLDER_ID;
  const pretty = (v: unknown) => JSON.stringify(v, null, 2);
  switch (op) {
    case "create":
      return { operation: op, method: "POST", path: "/payment-requests", bodyText: pretty(createBody(env)), idempotencyKey: fixedKey ?? `order-1042-${randomToken(6)}` };
    case "retrieve":
      return { operation: op, method: "GET", path: `/payment-requests/${id}`, bodyText: "", idempotencyKey: "" };
    case "status":
      return { operation: op, method: "GET", path: `/payment-requests/${id}/status`, bodyText: "", idempotencyKey: "" };
    case "list":
      return { operation: op, method: "GET", path: "/payment-requests?limit=10", bodyText: "", idempotencyKey: "" };
    case "cancel":
      return { operation: op, method: "POST", path: `/payment-requests/${id}/cancel`, bodyText: "", idempotencyKey: "" };
    case "simulate":
      return { operation: op, method: "POST", path: `/payment-requests/${id}/simulate`, bodyText: pretty({ action: "pay" }), idempotencyKey: "" };
  }
}

function isPayment(body: unknown): body is PaymentRequest {
  return typeof body === "object" && body !== null && "qr_payload" in body && "history" in body;
}

export function Playground() {
  const ids = { op: useId(), path: useId(), key: useId(), body: useId() };
  const [env, setEnv] = useState<Env>("demo");
  const [events, setEvents] = useState<RecordedEvent[]>([]);
  const [gateway] = useState<Gateway>(() =>
    createLocalGateway({ latencyMs: 180, onEvent: (e) => setEvents((list) => [e, ...list].slice(0, 30)) }),
  );
  // A fixed key for the first render: random values cannot be read while prerendering.
  const [draft, setDraft] = useState<Draft>(() => template("create", "demo", null, "order-1042"));
  const [response, setResponse] = useState<(GatewayResponse & { key: string }) | null>(null);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [payment, setPayment] = useState<PaymentRequest | null>(null);
  const [lastCreate, setLastCreate] = useState<Draft | null>(null);
  const [lang, setLang] = useState<SnippetLanguage>("typescript");
  const [baseUrl, setBaseUrl] = useState("http://localhost:3000");
  const [now, setNow] = useState(0);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBaseUrl(window.location.origin), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!payment) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [payment]);

  const execute = useCallback(
    async (d: Draft): Promise<GatewayResponse> => {
      setSending(true);
      setHint(null);
      let res: GatewayResponse;
      const parsed = d.method === "POST" ? parseJsonBody(d.bodyText) : ({ ok: true, value: undefined } as const);
      if (!parsed.ok) {
        // The server returns exactly this for a body that is not JSON.
        const requestId = prefixedId("req", 16);
        res = { status: 400, headers: { "x-request-id": requestId }, body: parsed.error.toBody(requestId), durationMs: 0 };
      } else {
        res = await gateway.call({
          method: d.method,
          path: d.path,
          body: parsed.value,
          idempotencyKey: d.operation === "create" && d.idempotencyKey ? d.idempotencyKey : null,
        });
      }
      const key = prefixedId("res", 8);
      setResponse({ ...res, key });
      setHistory((h) => [{ id: key, draft: d, response: res, at: Date.now() }, ...h].slice(0, 25));
      if (res.status < 300 && isPayment(res.body)) {
        setPayment(res.body);
        setNow(Date.now());
      }
      if (d.operation === "create" && res.status < 300) setLastCreate(d);
      setSending(false);
      return res;
    },
    [gateway],
  );

  function chooseOperation(op: Operation) {
    setDraft(template(op, env, payment?.id ?? null));
  }

  function chooseEnv(next: Env) {
    setEnv(next);
    const parsed = parseJsonBody(draft.bodyText);
    if (parsed.ok && parsed.value && typeof parsed.value === "object" && "network" in parsed.value) {
      setDraft({ ...draft, bodyText: JSON.stringify({ ...(parsed.value as object), network: next }, null, 2) });
    }
  }

  const presets: { label: string; run: () => void }[] = [
    {
      label: "Amount sent as a number",
      run: () => setDraft({ ...template("create", env, null), bodyText: JSON.stringify(createBody(env, { amount: 0.25 }), null, 2) }),
    },
    {
      label: "Nine decimal places",
      run: () => setDraft({ ...template("create", env, null), bodyText: JSON.stringify(createBody(env, { amount: "0.123456789" }), null, 2) }),
    },
    {
      label: "Unknown field",
      run: () => setDraft({ ...template("create", env, null), bodyText: JSON.stringify(createBody(env, { customer_email: "ana@example.com" }), null, 2) }),
    },
    {
      label: "Supplying a destination",
      run: () => setDraft({ ...template("create", env, null), bodyText: JSON.stringify(createBody(env, { destination: "utest1..." }), null, 2) }),
    },
    {
      label: "Testnet without a backend",
      run: () => setDraft({ ...template("create", "testnet", null), bodyText: JSON.stringify(createBody("testnet"), null, 2) }),
    },
    {
      label: "Reused idempotency key",
      run: () => {
        if (!lastCreate) {
          setHint("Send a successful create request first, then try this to reuse its key with a different amount.");
          return;
        }
        const parsed = parseJsonBody(lastCreate.bodyText);
        const base = parsed.ok && parsed.value && typeof parsed.value === "object" ? (parsed.value as Record<string, unknown>) : createBody(env);
        setDraft({ ...lastCreate, bodyText: JSON.stringify({ ...base, amount: "9.99" }, null, 2) });
      },
    },
    {
      label: "Malformed JSON",
      run: () => setDraft({ ...template("create", env, null), bodyText: '{\n  "amount": "0.25",\n  "currency": "ZEC",\n}' }),
    },
    {
      label: "Unknown payment ID",
      run: () => setDraft({ ...template("retrieve", env, null), path: "/payment-requests/pay_demo_doesnotexist00000000" }),
    },
  ];

  const parsedBody = draft.method === "POST" ? parseJsonBody(draft.bodyText) : null;
  const snippet = useMemo(
    () =>
      generateSnippet(lang, {
        operation: draft.operation,
        method: draft.method,
        path: draft.path,
        body: parsedBody?.ok ? parsedBody.value : undefined,
        idempotencyKey: draft.operation === "create" ? draft.idempotencyKey || undefined : undefined,
        baseUrl,
      }),
    [lang, draft, parsedBody, baseUrl],
  );

  const fetchStatus = useCallback(
    async (id: string): Promise<PaymentStatusResponse> => {
      const res = await gateway.call({ method: "GET", path: `/payment-requests/${encodeURIComponent(id)}/status` });
      if (res.status !== 200) throw new Error((res.body as { error?: { message?: string } }).error?.message ?? "Status check failed.");
      return res.body as PaymentStatusResponse;
    },
    [gateway],
  );

  async function simulate(action: SimulateAction) {
    if (!payment) return;
    const d: Draft = { ...template("simulate", env, payment.id), bodyText: JSON.stringify({ action }, null, 2) };
    setDraft(d);
    await execute(d);
  }

  async function cancel() {
    if (!payment) return;
    const d = template("cancel", env, payment.id);
    setDraft(d);
    await execute(d);
  }

  const op = OPERATIONS.find((o) => o.id === draft.operation)!;
  const statusTone = (s: number) => (s < 300 ? "text-success" : s < 500 ? "text-warning" : "text-danger");

  return (
    <div className="flex flex-col gap-6">
      {/* Environment */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div role="radiogroup" aria-label="Environment" className="grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-line bg-surface p-1">
          {(
            [
              ["demo", "Simulator"],
              ["testnet", "Zcash testnet"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={cn(
                "relative flex h-9 cursor-pointer items-center justify-center rounded-[7px] px-4 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                env === value ? "text-text" : "text-muted hover:text-text",
              )}
            >
              {env === value && (
                <motion.span layoutId="pg-env" transition={transition.statusChange} className="absolute inset-0 rounded-[7px] border border-line-strong bg-surface-raised" />
              )}
              <input type="radio" name="pg-env" value={value} checked={env === value} onChange={() => chooseEnv(value)} className="sr-only" />
              <span className="relative">{label}</span>
            </label>
          ))}
        </div>
        <EnvironmentBadge env={env === "demo" ? "simulated" : "testnet"} />
      </div>

      <AnimatePresence initial={false}>
        {env === "testnet" && (
          <motion.div {...panelSwap} className="rounded-[var(--radius-panel)] border border-warning/25 bg-warning/[0.05] p-5">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <div className="text-sm leading-relaxed">
                <p className="font-medium text-text">Testnet is not available in this playground.</p>
                <p className="mt-1 text-muted">
                  This playground runs in your browser. Verifying a real testnet payment needs a Yola server with:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                  <li>a Zebra node synced to testnet, with a Zaino indexer in front of it</li>
                  <li>the Yola scanner holding your project&apos;s incoming viewing key</li>
                  <li>
                    <code className="font-mono text-[13px] text-text">YOLA_TESTNET_ENABLED=true</code> after the health check passes
                  </li>
                </ul>
                <p className="mt-2 text-muted">
                  You can still send testnet requests here to see the exact error the API returns.{" "}
                  {TESTNET_ADAPTER_UNCONFIGURED.limitations[1]}
                </p>
                <div className="mt-3 flex flex-wrap gap-4">
                  <button type="button" onClick={() => chooseEnv("demo")} className="text-brand-soft underline-offset-4 hover:underline">
                    Continue with the simulator
                  </button>
                  <Link href="/docs/testnet" className="text-brand-soft underline-offset-4 hover:underline">
                    Testnet setup guide
                  </Link>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Editor and response */}
      <div className="grid gap-px overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line lg:grid-cols-2">
        <form
          className="flex min-w-0 flex-col gap-5 bg-surface p-5 md:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            void execute(draft);
          }}
        >
          <div className="flex items-center justify-between">
            <h2 className="type-heading text-lg">Request</h2>
            <span className="text-xs text-muted">Runs against the in-browser simulator</span>
          </div>

          <div>
            <label htmlFor={ids.op} className="mb-2 block text-sm text-text">
              Endpoint
            </label>
            <select
              id={ids.op}
              value={draft.operation}
              onChange={(e) => chooseOperation(e.target.value as Operation)}
              className="h-10 w-full rounded-[var(--radius-control)] border border-line-strong bg-bg px-3 text-sm text-text outline-none focus:border-brand"
            >
              {OPERATIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={ids.path} className="mb-2 block text-sm text-text">
              Path {op.needsId && <span className="text-muted">(edit the ID to target another request)</span>}
            </label>
            <div className="flex h-10 items-center rounded-[var(--radius-control)] border border-line-strong bg-bg focus-within:border-brand">
              <span className={cn("border-r border-line px-3 font-mono text-xs font-medium", draft.method === "POST" ? "text-signal" : "text-brand-soft")}>
                {draft.method}
              </span>
              <span className="pl-3 font-mono text-[13px] text-faint">/api/v1</span>
              <input
                id={ids.path}
                value={draft.path}
                onChange={(e) => setDraft({ ...draft, path: e.target.value })}
                spellCheck={false}
                className="h-full min-w-0 flex-1 bg-transparent pr-3 font-mono text-[13px] text-text outline-none"
              />
            </div>
          </div>

          {draft.operation === "create" && (
            <div>
              <label htmlFor={ids.key} className="mb-2 block text-sm text-text">
                Idempotency-Key <span className="text-muted">(header, optional)</span>
              </label>
              <input
                id={ids.key}
                value={draft.idempotencyKey}
                onChange={(e) => setDraft({ ...draft, idempotencyKey: e.target.value })}
                spellCheck={false}
                className="h-10 w-full rounded-[var(--radius-control)] border border-line-strong bg-bg px-3 font-mono text-[13px] text-text outline-none focus:border-brand"
              />
            </div>
          )}

          {draft.method === "POST" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor={ids.body} className="text-sm text-text">
                  JSON body
                </label>
                {parsedBody && !parsedBody.ok && <span className="text-xs text-danger">Not valid JSON yet</span>}
              </div>
              <textarea
                id={ids.body}
                value={draft.bodyText}
                onChange={(e) => setDraft({ ...draft, bodyText: e.target.value })}
                spellCheck={false}
                rows={draft.operation === "create" ? 13 : 4}
                className={cn(
                  "w-full flex-1 resize-y rounded-[var(--radius-control)] border bg-bg p-3 font-mono text-[13px] leading-relaxed text-text outline-none focus:border-brand",
                  parsedBody && !parsedBody.ok ? "border-danger/60" : "border-line-strong",
                )}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={sending}>
              {!sending && <Send className="size-4" aria-hidden />}
              Send request
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(template(draft.operation, env, payment?.id ?? null))}>
              Reset to example
            </Button>
          </div>

          <div className="border-t border-line pt-4">
            <p className="mb-2 text-sm text-text">Try an error</p>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={p.run}
                  className="rounded-md border border-line px-2.5 py-1 text-xs text-muted transition-colors hover:border-line-strong hover:text-text"
                >
                  {p.label}
                </button>
              ))}
            </div>
            {hint && (
              <p role="status" className="mt-2 text-xs text-warning">
                {hint}
              </p>
            )}
          </div>
        </form>

        <section aria-label="Response" aria-live="polite" className="flex min-w-0 flex-col bg-[#0d0e14] p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="type-heading text-lg">Response</h2>
            {response && <CopyButton value={JSON.stringify(response.body, null, 2)} label="response body" />}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {sending && !response ? (
              <motion.div key="loading" {...panelSwap} className="flex flex-1 items-center justify-center text-sm text-muted">
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Sending
              </motion.div>
            ) : response ? (
              <motion.div key={response.key} {...panelSwap} className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs">
                  <span className={cn("text-sm font-medium", statusTone(response.status))}>HTTP {response.status}</span>
                  <span className="text-muted">{response.durationMs} ms</span>
                  <span className="text-faint">x-request-id: {response.headers["x-request-id"]}</span>
                  {response.headers["idempotent-replayed"] && <span className="text-signal">idempotent replay</span>}
                </div>
                <CodeBlock bare lang="json" code={JSON.stringify(response.body, null, 2)} className="max-h-[560px] overflow-auto" />
              </motion.div>
            ) : (
              <motion.div key="empty" {...panelSwap} className="flex flex-1 flex-col items-center justify-center py-16 text-center">
                <p className="text-sm text-text">No response yet</p>
                <p className="mt-1 max-w-xs text-[13px] text-muted">Send the example request to create a simulated payment.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

      {/* Inspector */}
      <section aria-labelledby="inspector-title" className="panel p-5 md:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 id="inspector-title" className="type-heading text-lg">
            Payment inspector
          </h2>
          {payment && <span className="font-mono text-xs text-muted">{payment.id}</span>}
        </div>
        {!payment ? (
          <p className="text-sm text-muted">Create or retrieve a payment request to inspect its QR code, live status and timeline here.</p>
        ) : (
          <div className="grid gap-8 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <div className="flex min-w-0 flex-col gap-6">
              <PaymentDetails payment={payment} now={now} />
            </div>
            <div className="flex min-w-0 flex-col gap-6">
              <div>
                <p className="mb-2 text-sm text-text">
                  <code className="font-mono text-[13px]">&lt;YolaPaymentStatus /&gt;</code>, polling the status endpoint
                </p>
                <YolaPaymentStatus key={payment.id} paymentId={payment.id} fetchStatus={fetchStatus} pollInterval={1000} />
              </div>
              <SimulatorControls payment={payment} busy={sending} onAction={simulate} onCancel={cancel} />
              <PaymentTimeline history={payment.history} trustLevel={payment.trust_level} />
            </div>
          </div>
        )}
      </section>

      {/* Code and history */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <section aria-labelledby="code-title" className="min-w-0 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-[#0b0c11]">
          <div className="flex items-center justify-between gap-2 border-b border-line pr-2">
            <h2 id="code-title" className="sr-only">
              Code for this request
            </h2>
            <div role="tablist" aria-label="Language" className="flex overflow-x-auto">
              {SNIPPET_LANGUAGES.map((l) => (
                <button
                  key={l.id}
                  role="tab"
                  aria-selected={lang === l.id}
                  onClick={() => setLang(l.id)}
                  className={cn("relative h-11 shrink-0 px-4 text-[13px] transition-colors", lang === l.id ? "text-text" : "text-muted hover:text-text")}
                >
                  {l.label}
                  {lang === l.id && (
                    <motion.span layoutId="pg-lang" transition={transition.statusChange} className="absolute inset-x-3 -bottom-px h-px bg-brand-soft" />
                  )}
                </button>
              ))}
            </div>
            <CopyButton value={snippet} label="code example" />
          </div>
          <CodeBlock bare lang={lang === "curl" || lang === "python" ? "bash" : "ts"} code={snippet} className="rounded-none border-0" />
          <p className="border-t border-line px-4 py-2.5 text-xs text-faint">
            The same request against a Yola server. Keep <code className="font-mono">YOLA_SECRET_KEY</code> on your server.
          </p>
        </section>

        <section aria-labelledby="history-title" className="panel flex min-w-0 flex-col p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="history-title" className="flex items-center gap-2 text-sm text-text">
              <History className="size-4 text-muted" aria-hidden /> Request history
            </h2>
            {history.length > 0 && (
              <button type="button" onClick={() => setHistory([])} className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
                <Trash2 className="size-3.5" aria-hidden /> Clear
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="text-[13px] text-muted">Requests you send appear here. Select one to load it again.</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {history.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(h.draft);
                      setResponse({ ...h.response, key: h.id });
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left font-mono text-xs transition-colors hover:bg-white/[0.04]",
                      response?.key === h.id && "bg-white/[0.04]",
                    )}
                  >
                    <span className={cn("w-8", statusTone(h.response.status))}>{h.response.status}</span>
                    <span className="w-9 text-muted">{h.draft.method}</span>
                    <span className="min-w-0 flex-1 truncate text-text/85">{h.draft.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 border-t border-line pt-4">
            <h2 className="text-sm text-text">Webhook events</h2>
            <p className="mt-1 text-xs text-faint">What a server would send. Recorded here, not delivered.</p>
            {events.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted">None yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1.5 font-mono text-xs">
                {events.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3">
                    <span className="truncate text-text/85">{e.type}</span>
                    <span className="shrink-0 text-faint">{new Date(e.created_at).toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

