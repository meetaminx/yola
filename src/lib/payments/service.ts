import { ApiError, notFound } from "@/lib/api/errors";
import {
  assertPaymentId,
  EXPIRES_IN_DEFAULT,
  parseCreateInput,
  parseIdempotencyKey,
  parseSimulateInput,
  type ListQuery,
  type ValidCreateInput,
} from "@/lib/api/schemas";
import { prefixedId } from "@/lib/utils/ids";
import { formatZecFixed } from "./amount";
import { createDemoPaymentRequest, runSimulation } from "./demo-adapter";
import { cancelPayment, expireIfDue } from "./lifecycle";
import { isTerminal, STATUS_COPY } from "./state-machine";
import {
  VersionConflictError,
  type IdempotencyStore,
  type PaymentEventSink,
  type PaymentRepo,
  type StoredPayment,
} from "./store";
import type { Network, PaymentRequest, PaymentStatusResponse } from "./types";

/**
 * PaymentService: the business logic behind /api/v1/payment-requests.
 *
 * The same class runs in the browser (playground, sample store, with
 * in-memory stores) and on the server (with Postgres stores), so validation,
 * idempotency, lifecycle rules and response shapes cannot drift apart.
 */

export interface RequestContext {
  projectId: string;
  /** Networks the caller's credential may use. Test keys: demo + testnet. Live keys: mainnet. */
  allowedNetworks: readonly Network[];
}

/** Creates the network-specific parts of a request. Absent means the network is unavailable. */
export interface NetworkProvider {
  network: Network;
  create(ctx: RequestContext, input: ValidCreateInput, id: string, now: Date): Promise<StoredPayment>;
}

export interface ServiceResult<T = unknown> {
  status: number;
  body: T;
  /** True when an idempotent replay returned a stored response. */
  replayed?: boolean;
}

export interface PaymentServiceDeps {
  repo: PaymentRepo;
  idempotency: IdempotencyStore;
  providers: Partial<Record<Network, NetworkProvider>>;
  /** Why a network has no provider, shown to the caller. */
  unavailableReason?: Partial<Record<Network, string>>;
  events?: PaymentEventSink;
  now?: () => Date;
  /**
   * How far chain evidence has been checked for a network (see isDue).
   * Demo payments use the current time; a chain network without this never expires early.
   */
  observedThrough?: (network: Network) => Promise<Date | null>;
}

export const demoProvider: NetworkProvider = {
  network: "demo",
  async create(ctx, input, id, now) {
    const p = createDemoPaymentRequest({
      id,
      now,
      amountZatoshis: input.amountZatoshis,
      description: input.description,
      externalReference: input.external_reference,
      metadata: input.metadata,
      expiresIn: input.expires_in ?? EXPIRES_IN_DEFAULT,
    });
    return { ...p, projectId: ctx.projectId, version: 0, diversifierIndex: null };
  },
};

/** Public API shape. Internal columns never leave the service. */
export function serializePayment(p: StoredPayment | PaymentRequest): PaymentRequest {
  return {
    id: p.id,
    amount: p.amount,
    amount_zatoshis: p.amount_zatoshis,
    currency: p.currency,
    network: p.network,
    trust_level: p.trust_level,
    destination: p.destination,
    description: p.description,
    external_reference: p.external_reference,
    metadata: p.metadata,
    status: p.status,
    created_at: p.created_at,
    expires_at: p.expires_at,
    payment_uri: p.payment_uri,
    qr_payload: p.qr_payload,
    status_url: p.status_url,
    confirmations: p.confirmations,
    amount_received_zatoshis: p.amount_received_zatoshis,
    transaction_id: p.transaction_id,
    updated_at: p.updated_at,
    history: p.history,
  };
}

export function serializeStatus(p: PaymentRequest): PaymentStatusResponse {
  return {
    id: p.id,
    status: p.status,
    network: p.network,
    trust_level: p.trust_level,
    amount: p.amount,
    amount_received: p.amount_received_zatoshis === null ? null : formatZecFixed(BigInt(p.amount_received_zatoshis)),
    confirmations: p.confirmations,
    transaction_id: p.transaction_id,
    expires_at: p.expires_at,
    updated_at: p.updated_at,
    final: isTerminal(p.status),
  };
}

/** Stable JSON: sorted keys, so equivalent bodies produce the same fingerprint. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

export async function fingerprint(input: ValidCreateInput): Promise<string> {
  // Fingerprint the meaning, not the bytes: "0.10" and "0.1" are the same request.
  const { amountZatoshis, amount: _amount, ...rest } = input;
  void _amount;
  const data = new TextEncoder().encode(canonical({ ...rest, amount_zatoshis: amountZatoshis.toString() }));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class PaymentService {
  readonly #d: Required<Omit<PaymentServiceDeps, "events" | "unavailableReason" | "observedThrough">> &
    Pick<PaymentServiceDeps, "events" | "unavailableReason" | "observedThrough">;

  constructor(deps: PaymentServiceDeps) {
    this.#d = { now: () => new Date(), ...deps };
  }

  async create(ctx: RequestContext, body: unknown, idempotencyHeader: string | null): Promise<ServiceResult<PaymentRequest>> {
    const key = parseIdempotencyKey(idempotencyHeader);
    const input = parseCreateInput(body);
    const provider = this.#provider(ctx, input.network);

    if (key) {
      const begun = await this.#d.idempotency.begin(ctx.projectId, key, await fingerprint(input));
      if (begun.kind === "replay") return { status: begun.status, body: begun.body as PaymentRequest, replayed: true };
      if (begun.kind === "conflict") {
        throw new ApiError(
          409,
          "idempotency_conflict",
          "This Idempotency-Key was already used with different parameters. Use a new key for a different request.",
        );
      }
      if (begun.kind === "in_progress") {
        throw new ApiError(409, "idempotency_in_progress", "A request with this Idempotency-Key is still being processed. Retry shortly.", undefined, {
          "Retry-After": "1",
        });
      }
    }

    let created: StoredPayment;
    try {
      const now = this.#d.now();
      created = await provider.create(ctx, input, prefixedId(`pay_${input.network}`), now);
      await this.#d.repo.insert(created);
    } catch (err) {
      if (key) await this.#d.idempotency.release(ctx.projectId, key);
      throw err;
    }
    await this.#d.events?.statusChanged(created, 0);
    const result = serializePayment(created);
    if (key) await this.#d.idempotency.complete(ctx.projectId, key, 201, result);
    return { status: 201, body: result };
  }

  async retrieve(ctx: RequestContext, id: string): Promise<ServiceResult<PaymentRequest>> {
    return { status: 200, body: serializePayment(await this.#load(ctx, id)) };
  }

  async status(ctx: RequestContext, id: string): Promise<ServiceResult<PaymentStatusResponse>> {
    return { status: 200, body: serializeStatus(await this.#load(ctx, id)) };
  }

  async list(ctx: RequestContext, q: ListQuery) {
    const { items, hasMore } = await this.#d.repo.list(ctx.projectId, q);
    const now = this.#d.now();
    const data = await Promise.all(
      items.map(async (p) => (expireIfDue(p, now, await this.#observedThrough(p, now)) !== p ? this.#load(ctx, p.id) : p)),
    );
    return {
      status: 200,
      body: { data: data.map(serializePayment), has_more: hasMore, next_cursor: hasMore ? data.at(-1)?.id ?? null : null },
    };
  }

  async cancel(ctx: RequestContext, id: string): Promise<ServiceResult<PaymentRequest>> {
    const p = await this.#mutate(ctx, id, (current, now) => {
      if (current.status !== "created" && current.status !== "awaiting_payment") {
        throw new ApiError(
          409,
          "invalid_state",
          `A payment that is "${STATUS_COPY[current.status].label.toLowerCase()}" cannot be cancelled. Only requests still awaiting payment can.`,
        );
      }
      return cancelPayment(current, now);
    });
    return { status: 200, body: serializePayment(p) };
  }

  /** Drive a demo payment through the simulator. Refused for every other network. */
  async simulate(ctx: RequestContext, id: string, body: unknown): Promise<ServiceResult<PaymentRequest>> {
    const { action } = parseSimulateInput(body);
    const p = await this.#mutate(ctx, id, (current, now) => {
      if (current.network !== "demo" || current.trust_level !== "simulated") {
        throw new ApiError(403, "simulation_not_allowed", "Only demo payment requests can be simulated.");
      }
      try {
        return runSimulation(current, action, now);
      } catch (err) {
        throw new ApiError(409, "invalid_state", err instanceof Error ? err.message : "That action is not available now.");
      }
    });
    return { status: 200, body: serializePayment(p) };
  }

  #provider(ctx: RequestContext, network: Network): NetworkProvider {
    if (!ctx.allowedNetworks.includes(network)) {
      throw new ApiError(
        403,
        "network_not_allowed",
        network === "mainnet"
          ? "This credential is for test environments. Mainnet requests need a live key."
          : `This credential cannot create ${network} requests. Use a test key.`,
        { network: `Not allowed for this credential.` },
      );
    }
    const provider = this.#d.providers[network];
    if (!provider) {
      throw new ApiError(
        503,
        network === "mainnet" ? "network_disabled" : "network_unavailable",
        this.#d.unavailableReason?.[network] ??
          (network === "mainnet"
            ? "Mainnet is disabled until the verification path has been tested and reviewed."
            : `The ${network} adapter is not configured on this server.`),
      );
    }
    return provider;
  }

  async #observedThrough(p: StoredPayment, now: Date): Promise<Date | null> {
    if (p.network === "demo") return now;
    return (await this.#d.observedThrough?.(p.network)) ?? null;
  }

  /** Load a payment, applying expiry if its deadline has passed. */
  async #load(ctx: RequestContext, id: string): Promise<StoredPayment> {
    return this.#mutate(ctx, id, (p) => p, true);
  }

  async #mutate(
    ctx: RequestContext,
    id: string,
    fn: (p: StoredPayment, now: Date) => StoredPayment,
    readOnly = false,
  ): Promise<StoredPayment> {
    assertPaymentId(id);
    for (let attempt = 0; attempt < 4; attempt++) {
      const current = await this.#d.repo.get(ctx.projectId, id);
      if (!current) throw notFound();
      const now = this.#d.now();
      const expired = expireIfDue(current, now, await this.#observedThrough(current, now));
      const next = fn(expired, now);
      if (next === current) return current;
      if (readOnly && expired === current) return current;
      try {
        const saved = await this.#d.repo.save(next, current.version);
        await this.#d.events?.statusChanged(saved, current.history.length);
        return saved;
      } catch (err) {
        if (err instanceof VersionConflictError) continue;
        throw err;
      }
    }
    throw new ApiError(409, "invalid_state", "The payment kept changing while it was being updated. Retry the request.");
  }
}
