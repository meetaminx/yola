/**
 * @yola/sdk — server-side TypeScript client for the Yola API (v1).
 *
 * Status: the client is implemented and unit-tested against the v1 contract.
 * The /api/v1 route handlers it calls arrive in Stage 3 of the build.
 *
 * Secret keys (ysk_…) must stay on your server. The constructor refuses
 * to run with a secret key in a browser.
 */
import type { Network, PaymentRequest, PaymentStatus } from "@/lib/payments/types";
import { parseZec } from "@/lib/payments/amount";

export type { Network, PaymentRequest, PaymentStatus };
export { verifySignature as verifyWebhookSignature } from "@/lib/webhooks/signature";

export interface YolaClientOptions {
  apiKey: string;
  /** Defaults to http://localhost:3000. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Defaults to 15000. */
  timeoutMs?: number;
  /** Injectable for tests and non-standard runtimes. */
  fetch?: typeof fetch;
}

export interface CreatePaymentRequestParams {
  /** Decimal ZEC string, e.g. "0.01". Never a float. */
  amount: string;
  currency: "ZEC";
  network: Network;
  /**
   * Optional. On testnet and mainnet Yola normally derives a fresh shielded
   * address for each request from the project's incoming viewing key, so you
   * omit this. Ignored in demo mode.
   */
  destination?: string;
  description?: string;
  external_reference?: string;
  /** Seconds until the request expires. */
  expires_in?: number;
  metadata?: Record<string, string>;
}

export interface RequestOptions {
  /** Retry-safe creation. Reusing a key with different parameters returns 409. */
  idempotencyKey?: string;
}

export interface PaymentStatusResponse {
  id: string;
  status: PaymentStatus;
  network: Network;
  trust_level: PaymentRequest["trust_level"];
  confirmations: PaymentRequest["confirmations"];
  transaction_id: string | null;
  updated_at: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string>;
    request_id: string;
  };
}

export class YolaApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "YolaApiError";
  }
}

export class YolaClient {
  readonly paymentRequests: PaymentRequestsResource;
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: YolaClientOptions) {
    if (!options.apiKey) throw new Error("YolaClient: apiKey is required.");
    if (typeof window !== "undefined" && options.apiKey.startsWith("ysk_")) {
      throw new Error(
        "YolaClient: a secret key (ysk_…) was used in a browser. Create payment requests on your server instead.",
      );
    }
    this.#apiKey = options.apiKey;
    this.#baseUrl = (options.baseUrl ?? "http://localhost:3000").replace(/\/+$/, "");
    this.#timeoutMs = options.timeoutMs ?? 15_000;
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.paymentRequests = new PaymentRequestsResource(this);
  }

  /** @internal */
  async request<T>(method: "GET" | "POST", path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.#apiKey}`,
      Accept: "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (opts?.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

    let res: Response;
    try {
      res = await this.#fetch(`${this.#baseUrl}/api/v1${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "AbortError";
      throw new YolaApiError(
        0,
        timedOut ? "timeout" : "network_error",
        timedOut ? `Request timed out after ${this.#timeoutMs} ms.` : "Could not reach the Yola API.",
        null,
      );
    } finally {
      clearTimeout(timer);
    }

    const requestId = res.headers.get("x-request-id");
    const text = await res.text();
    const json: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const e = (json as ApiErrorBody | null)?.error;
      throw new YolaApiError(
        res.status,
        e?.code ?? "http_error",
        e?.message ?? `Request failed with HTTP ${res.status}.`,
        e?.request_id ?? requestId,
        e?.fields,
      );
    }
    return json as T;
  }
}

class PaymentRequestsResource {
  constructor(private readonly client: YolaClient) {}

  create(params: CreatePaymentRequestParams, opts?: RequestOptions): Promise<PaymentRequest> {
    const parsed = parseZec(params.amount);
    if (!parsed.ok) {
      return Promise.reject(new YolaApiError(400, parsed.code, parsed.message, null, { amount: parsed.message }));
    }
    return this.client.request("POST", "/payment-requests", params, opts);
  }

  retrieve(id: string): Promise<PaymentRequest> {
    return this.client.request("GET", `/payment-requests/${encodeURIComponent(id)}`);
  }

  status(id: string): Promise<PaymentStatusResponse> {
    return this.client.request("GET", `/payment-requests/${encodeURIComponent(id)}/status`);
  }

  cancel(id: string): Promise<PaymentRequest> {
    return this.client.request("POST", `/payment-requests/${encodeURIComponent(id)}/cancel`);
  }

  list(params?: { status?: PaymentStatus; limit?: number; starting_after?: string }) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.starting_after) qs.set("starting_after", params.starting_after);
    const suffix = qs.size ? `?${qs}` : "";
    return this.client.request<{ data: PaymentRequest[]; has_more: boolean }>("GET", `/payment-requests${suffix}`);
  }
}
