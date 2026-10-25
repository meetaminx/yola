import { prefixedId } from "@/lib/utils/ids";
import { demoProvider, PaymentService, type RequestContext } from "@/lib/payments/service";
import { MemoryIdempotencyStore, MemoryPaymentRepo, type PaymentEventSink, type StoredPayment } from "@/lib/payments/store";
import { ApiError } from "./errors";
import { dispatchPaymentRoute, type ApiCall } from "./router";

/**
 * A Yola API that runs entirely in the browser tab, for the playground and
 * the sample store. It uses the real PaymentService with in-memory storage
 * and the demo provider only. Nothing leaves the page; reloading clears it.
 */

export interface GatewayResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  durationMs: number;
}

export interface Gateway {
  readonly kind: "local" | "server";
  readonly label: string;
  call(req: ApiCall): Promise<GatewayResponse>;
}

/** A webhook event the server would send. Locally they are only recorded. */
export interface RecordedEvent {
  id: string;
  type: string;
  payment_id: string;
  created_at: string;
}

const TESTNET_UNAVAILABLE =
  "The in-browser simulator has no Zcash backend. Testnet requests need a Yola server with a Zebra node, a Zaino indexer and a viewing-key scanner configured.";

export interface LocalGatewayOptions {
  /** Called with each would-be webhook event. */
  onEvent?: (e: RecordedEvent) => void;
  /** Artificial latency so loading states are visible. */
  latencyMs?: number;
}

export function createLocalGateway(opts: LocalGatewayOptions = {}): Gateway {
  const events: PaymentEventSink = {
    async statusChanged(p: StoredPayment, prev: number) {
      for (const h of p.history.slice(prev)) {
        opts.onEvent?.({ id: prefixedId("evt"), type: `payment_request.${h.status}`, payment_id: p.id, created_at: h.at });
      }
    },
  };
  const service = new PaymentService({
    repo: new MemoryPaymentRepo(),
    idempotency: new MemoryIdempotencyStore(),
    providers: { demo: demoProvider },
    unavailableReason: { testnet: TESTNET_UNAVAILABLE },
    events,
  });
  const ctx: RequestContext = { projectId: "local", allowedNetworks: ["demo", "testnet"] };

  return {
    kind: "local",
    label: "In-browser simulator",
    async call(req) {
      const started = performance.now();
      const requestId = prefixedId("req", 16);
      if (opts.latencyMs) await new Promise((r) => setTimeout(r, opts.latencyMs));
      let status: number;
      let body: unknown;
      const headers: Record<string, string> = { "content-type": "application/json", "x-request-id": requestId };
      try {
        const result = await dispatchPaymentRoute(service, ctx, req);
        status = result.status;
        body = result.body;
        if (result.replayed) headers["idempotent-replayed"] = "true";
      } catch (err) {
        const e = err instanceof ApiError ? err : new ApiError(500, "internal_error", "Unexpected error in the simulator.");
        status = e.status;
        body = e.toBody(requestId);
        Object.assign(headers, e.headers);
      }
      return { status, headers, body, durationMs: Math.round(performance.now() - started) };
    },
  };
}

/** Parse a JSON body typed by a person, producing the same error the server would. */
export function parseJsonBody(text: string): { ok: true; value: unknown } | { ok: false; error: ApiError } {
  if (text.trim() === "") return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return {
      ok: false,
      error: new ApiError(400, "invalid_json", `The body is not valid JSON: ${err instanceof Error ? err.message : "parse error"}.`),
    };
  }
}
