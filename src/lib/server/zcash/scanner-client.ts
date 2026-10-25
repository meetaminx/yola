import "server-only";
import { z } from "zod";

/**
 * HTTP client for the Yola scanner (scanner/ in this repository), the Rust
 * service that derives per-request addresses and trial-decrypts compact
 * blocks with the official Zcash crates.
 *
 * Viewing keys travel in request bodies over this server-to-server link and
 * are never logged. Responses are validated, so a misbehaving scanner fails
 * loudly instead of feeding malformed data into payment decisions.
 */

const decimal = z.string().regex(/^\d{1,40}$/);
const height = z.number().int().nonnegative();

const MatchSchema = z.object({
  key_id: z.string(),
  txid: z.string().regex(/^[0-9a-f]{64}$/),
  pool: z.enum(["sapling", "orchard", "ironwood"]),
  output_index: z.number().int().nonnegative(),
  value_zat: decimal,
  diversifier_index: decimal,
  height: height.nullable(),
});
export type ScanMatch = z.infer<typeof MatchSchema>;

const BlockSchema = z.object({
  height,
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  prev_hash: z.string().regex(/^[0-9a-f]{64}$/),
  time: z.number().int().nonnegative(),
});
export type ScanBlock = z.infer<typeof BlockSchema>;

const HealthSchema = z.object({
  status: z.enum(["ok", "wrong_network", "unavailable"]),
  chain_name: z.string().optional(),
  tip_height: height.optional(),
});
const InspectSchema = z.object({
  uivk: z.string().min(10),
  fingerprint: z.string().regex(/^[0-9a-f]{16}$/),
  was_full_viewing_key: z.boolean(),
  has_sapling: z.boolean(),
  has_orchard: z.boolean(),
  first_address: z.string(),
  first_index: decimal,
});
export type InspectedKey = z.infer<typeof InspectSchema>;
const AddressSchema = z.object({ address: z.string().min(10), index: decimal });
const ScanSchema = z.object({ tip_height: height, blocks: z.array(BlockSchema), matches: z.array(MatchSchema) });
const MempoolSchema = z.object({ tip_height: height, transactions: z.number().int(), matches: z.array(MatchSchema) });
const BlockResponseSchema = z.object({ tip_height: height, block: BlockSchema });
const ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

export interface KeyRef {
  id: string;
  uivk: string;
}

/** The scanner answered with an error it chose to send (validation, wrong network, not found). */
export class ScannerError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ScannerError";
  }
}

/** The scanner could not be reached or returned something unusable. */
export class ScannerUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScannerUnavailableError";
  }
}

export interface ScannerApi {
  health(): Promise<z.infer<typeof HealthSchema>>;
  inspectKey(viewingKey: string): Promise<InspectedKey>;
  deriveAddress(uivk: string, index: string): Promise<{ address: string; index: string }>;
  scan(start: number, end: number, keys: KeyRef[]): Promise<z.infer<typeof ScanSchema>>;
  mempool(keys: KeyRef[]): Promise<z.infer<typeof MempoolSchema>>;
  block(height: number): Promise<z.infer<typeof BlockResponseSchema>>;
}

export function createScannerClient(opts: { baseUrl: string; token: string; timeoutMs?: number; fetchImpl?: typeof fetch }): ScannerApi {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetchImpl ?? fetch;

  async function call<T>(schema: z.ZodType<T>, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${opts.token}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
        cache: "no-store",
        redirect: "error",
      });
    } catch (err) {
      throw new ScannerUnavailableError(`Scanner unreachable: ${err instanceof Error ? err.name : "error"}`);
    }
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const parsed = ErrorSchema.safeParse(json);
      if (parsed.success && res.status !== 502 && res.status !== 401) {
        throw new ScannerError(res.status, parsed.data.error.code, parsed.data.error.message);
      }
      // 401 means Yola and the scanner disagree on the token: an operator problem, not the caller's.
      throw new ScannerUnavailableError(
        res.status === 401 ? "Scanner rejected the configured token." : `Scanner returned HTTP ${res.status}.`,
      );
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ScannerUnavailableError("Scanner returned an unexpected response.");
    return parsed.data;
  }

  return {
    async health() {
      // Health answers 503 with a body when the backend is down; read it rather than throw.
      try {
        const res = await doFetch(`${base}/v1/health`, {
          headers: { authorization: `Bearer ${opts.token}` },
          signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
          cache: "no-store",
          redirect: "error",
        });
        const parsed = HealthSchema.safeParse(await res.json().catch(() => null));
        if (res.status === 401 || !parsed.success) return { status: "unavailable" as const };
        return parsed.data;
      } catch {
        return { status: "unavailable" as const };
      }
    },
    inspectKey: (viewingKey) => call(InspectSchema, "POST", "/v1/keys/inspect", { viewing_key: viewingKey }),
    deriveAddress: (uivk, index) => call(AddressSchema, "POST", "/v1/addresses", { uivk, index }),
    scan: (start, end, keys) => call(ScanSchema, "POST", "/v1/scan", { start, end, keys }),
    mempool: (keys) => call(MempoolSchema, "POST", "/v1/mempool", { keys }),
    block: (h) => call(BlockResponseSchema, "GET", `/v1/blocks/${h}`),
  };
}
