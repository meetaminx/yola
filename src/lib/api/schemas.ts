import { z } from "zod";
import { parseZec } from "@/lib/payments/amount";
import { PAYMENT_STATUSES } from "@/lib/payments/types";
import { SIMULATE_ACTIONS } from "@/lib/payments/demo-adapter";
import { ApiError } from "./errors";

/** Printable ASCII without control characters. */
const PRINTABLE = /^[\x20-\x7E]*$/;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

export const METADATA_MAX_KEYS = 20;
export const METADATA_MAX_BYTES = 4096;
export const EXPIRES_IN_MIN = 60;
export const EXPIRES_IN_MAX = 24 * 60 * 60;
export const EXPIRES_IN_DEFAULT = 15 * 60;

export const NetworkSchema = z.enum(["demo", "testnet", "mainnet"]);

export const CreatePaymentRequestSchema = z.strictObject({
  amount: z.string({ error: 'amount must be a decimal string, such as "0.25". Numbers are rejected to avoid rounding.' }),
  currency: z.literal("ZEC", { error: 'currency must be "ZEC".' }),
  network: NetworkSchema,
  description: z
    .string()
    .max(200, "description can be at most 200 characters.")
    .refine((s) => !CONTROL_CHARS.test(s), "description cannot contain control characters.")
    .optional(),
  external_reference: z
    .string()
    .min(1)
    .max(128, "external_reference can be at most 128 characters.")
    .regex(PRINTABLE, "external_reference must be printable ASCII.")
    .optional(),
  expires_in: z
    .number({ error: "expires_in must be a whole number of seconds." })
    .int("expires_in must be a whole number of seconds.")
    .min(EXPIRES_IN_MIN, `expires_in must be at least ${EXPIRES_IN_MIN} seconds.`)
    .max(EXPIRES_IN_MAX, `expires_in can be at most ${EXPIRES_IN_MAX} seconds (24 hours).`)
    .optional(),
  metadata: z
    .record(
      z.string().regex(/^[A-Za-z0-9_.-]{1,40}$/, "metadata keys must be 1-40 characters of A-Z, a-z, 0-9, _ . -"),
      z.string().max(500, "metadata values can be at most 500 characters."),
    )
    .refine((m) => Object.keys(m).length <= METADATA_MAX_KEYS, `metadata can have at most ${METADATA_MAX_KEYS} keys.`)
    .refine(
      (m) => new TextEncoder().encode(JSON.stringify(m)).length <= METADATA_MAX_BYTES,
      `metadata can be at most ${METADATA_MAX_BYTES} bytes.`,
    )
    .optional(),
});

export type CreatePaymentRequestInput = z.infer<typeof CreatePaymentRequestSchema>;

export interface ValidCreateInput extends CreatePaymentRequestInput {
  amountZatoshis: bigint;
}

function fieldsFrom(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    if (!(key in fields)) {
      fields[key] =
        issue.code === "unrecognized_keys"
          ? `Unknown field${issue.keys.length > 1 ? "s" : ""}: ${issue.keys.join(", ")}.`
          : issue.message;
    }
  }
  return fields;
}

/** Validate a create body. Throws ApiError with field-level details. */
export function parseCreateInput(body: unknown): ValidCreateInput {
  if (body && typeof body === "object" && "destination" in body) {
    throw new ApiError(
      422,
      "destination_not_accepted",
      "Yola derives a unique receiving address for every request from your project's viewing key, so a destination cannot be supplied.",
      { destination: "Remove this field." },
    );
  }
  const result = CreatePaymentRequestSchema.safeParse(body);
  if (!result.success) {
    throw new ApiError(422, "invalid_request", "The request body is invalid.", fieldsFrom(result.error));
  }
  const amount = parseZec(result.data.amount);
  if (!amount.ok) {
    throw new ApiError(422, amount.code, amount.message, { amount: amount.message });
  }
  return { ...result.data, amountZatoshis: amount.zatoshis };
}

export const ListQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  starting_after: z.string().max(64).optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  network: NetworkSchema.optional(),
});

export type ListQuery = z.infer<typeof ListQuerySchema>;

export function parseListQuery(params: URLSearchParams): ListQuery {
  const raw: Record<string, string> = {};
  for (const [k, v] of params) raw[k] = v;
  const result = ListQuerySchema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(422, "invalid_request", "The query parameters are invalid.", fieldsFrom(result.error));
  }
  return result.data;
}

export const SimulateSchema = z.strictObject({ action: z.enum(SIMULATE_ACTIONS) });

export function parseSimulateInput(body: unknown) {
  const result = SimulateSchema.safeParse(body);
  if (!result.success) {
    throw new ApiError(422, "invalid_request", "The request body is invalid.", fieldsFrom(result.error));
  }
  return result.data;
}

const IDEMPOTENCY_KEY = /^[\x21-\x7E]{1,255}$/;

export function parseIdempotencyKey(value: string | null): string | null {
  if (value === null) return null;
  if (!IDEMPOTENCY_KEY.test(value)) {
    throw new ApiError(
      400,
      "invalid_idempotency_key",
      "Idempotency-Key must be 1-255 visible ASCII characters with no spaces.",
    );
  }
  return value;
}

const ID_PATTERN = /^pay_[a-z0-9_]{6,64}$/;

/** Reject malformed IDs early so they never reach a query. */
export function assertPaymentId(id: string) {
  if (!ID_PATTERN.test(id)) throw new ApiError(404, "not_found", "No payment request with that ID exists in this project.");
}
