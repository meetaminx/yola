import type { ListQuery } from "@/lib/api/schemas";
import type { PaymentRequest } from "./types";

/**
 * Storage contracts for the payment service. The browser simulator uses the
 * in-memory implementations below; the server uses Postgres implementations
 * (src/lib/server/repos.ts). Both must honour the same semantics:
 *
 * - save() is optimistic: it fails with VersionConflictError if the stored
 *   version is not `expectedVersion`, so two writers can never silently
 *   overwrite each other's transitions.
 * - Every read is scoped by projectId. There is no unscoped lookup.
 */

export interface StoredPayment extends PaymentRequest {
  projectId: string;
  version: number;
  /** For testnet/mainnet: index of the diversified address derived for this request. */
  diversifierIndex: string | null;
}

export class VersionConflictError extends Error {
  constructor() {
    super("The payment changed while it was being updated.");
    this.name = "VersionConflictError";
  }
}

export interface PaymentRepo {
  insert(p: StoredPayment): Promise<void>;
  get(projectId: string, id: string): Promise<StoredPayment | null>;
  save(p: StoredPayment, expectedVersion: number): Promise<StoredPayment>;
  list(projectId: string, q: ListQuery): Promise<{ items: StoredPayment[]; hasMore: boolean }>;
}

export type IdempotencyBegin =
  | { kind: "new" }
  | { kind: "replay"; status: number; body: unknown }
  | { kind: "conflict" }
  | { kind: "in_progress" };

export interface IdempotencyStore {
  /** Claim a key for a request fingerprint, or report what already happened under it. */
  begin(projectId: string, key: string, fingerprint: string): Promise<IdempotencyBegin>;
  complete(projectId: string, key: string, status: number, body: unknown): Promise<void>;
  /** Release a claim after a failure that did not create anything, so the client can retry. */
  release(projectId: string, key: string): Promise<void>;
}

/** Receives every status change, in order. The server turns these into webhook events. */
export interface PaymentEventSink {
  statusChanged(p: StoredPayment, previousHistoryLength: number): Promise<void>;
}

/* ── In-memory implementations (browser simulator and tests) ───────── */

export class MemoryPaymentRepo implements PaymentRepo {
  readonly #rows = new Map<string, StoredPayment>();

  async insert(p: StoredPayment) {
    if (this.#rows.has(p.id)) throw new Error("Duplicate payment ID.");
    this.#rows.set(p.id, structuredClone(p));
  }

  async get(projectId: string, id: string) {
    const row = this.#rows.get(id);
    return row && row.projectId === projectId ? structuredClone(row) : null;
  }

  async save(p: StoredPayment, expectedVersion: number) {
    const row = this.#rows.get(p.id);
    if (!row || row.projectId !== p.projectId || row.version !== expectedVersion) throw new VersionConflictError();
    const next = { ...structuredClone(p), version: expectedVersion + 1 };
    this.#rows.set(p.id, next);
    return structuredClone(next);
  }

  async list(projectId: string, q: ListQuery) {
    let rows = [...this.#rows.values()]
      .filter((r) => r.projectId === projectId)
      .filter((r) => !q.status || r.status === q.status)
      .filter((r) => !q.network || r.network === q.network)
      .sort((a, b) => (a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1));
    if (q.starting_after) {
      const i = rows.findIndex((r) => r.id === q.starting_after);
      rows = i === -1 ? [] : rows.slice(i + 1);
    }
    return { items: rows.slice(0, q.limit).map((r) => structuredClone(r)), hasMore: rows.length > q.limit };
  }
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  readonly #rows = new Map<string, { fingerprint: string; status?: number; body?: unknown }>();

  async begin(projectId: string, key: string, fingerprint: string): Promise<IdempotencyBegin> {
    const k = `${projectId}:${key}`;
    const row = this.#rows.get(k);
    if (!row) {
      this.#rows.set(k, { fingerprint });
      return { kind: "new" };
    }
    if (row.fingerprint !== fingerprint) return { kind: "conflict" };
    if (row.status === undefined) return { kind: "in_progress" };
    return { kind: "replay", status: row.status, body: structuredClone(row.body) };
  }

  async complete(projectId: string, key: string, status: number, body: unknown) {
    const row = this.#rows.get(`${projectId}:${key}`);
    if (row) Object.assign(row, { status, body: structuredClone(body) });
  }

  async release(projectId: string, key: string) {
    this.#rows.delete(`${projectId}:${key}`);
  }
}
