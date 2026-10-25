/**
 * Exact ZEC amount handling. No floating point anywhere: amounts are parsed
 * from decimal strings straight into integer zatoshis (bigint).
 */

export const ZATOSHIS_PER_ZEC = 100_000_000n;
/** ZEC's maximum money supply, used as a sanity ceiling for a single request. */
export const MAX_ZEC_ZATOSHIS = 21_000_000n * ZATOSHIS_PER_ZEC;

export type AmountParseResult =
  | { ok: true; zatoshis: bigint }
  | { ok: false; code: AmountErrorCode; message: string };

export type AmountErrorCode =
  | "amount_empty"
  | "amount_format"
  | "amount_precision"
  | "amount_not_positive"
  | "amount_too_large";

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;

export function parseZec(input: string): AmountParseResult {
  const value = input.trim();
  if (value === "") {
    return { ok: false, code: "amount_empty", message: "Enter an amount in ZEC." };
  }
  const match = DECIMAL.exec(value);
  if (!match) {
    return {
      ok: false,
      code: "amount_format",
      message: "Use a plain decimal number, like 0.25. No signs, commas or exponents.",
    };
  }
  const whole = match[1];
  const fraction = match[2] ?? "";
  if (fraction.length > 8) {
    return {
      ok: false,
      code: "amount_precision",
      message: "ZEC supports at most 8 decimal places (1 zatoshi = 0.00000001 ZEC).",
    };
  }
  const zatoshis = BigInt(whole) * ZATOSHIS_PER_ZEC + BigInt(fraction.padEnd(8, "0"));
  if (zatoshis <= 0n) {
    return { ok: false, code: "amount_not_positive", message: "The amount must be greater than zero." };
  }
  if (zatoshis > MAX_ZEC_ZATOSHIS) {
    return { ok: false, code: "amount_too_large", message: "The amount exceeds the total ZEC supply." };
  }
  return { ok: true, zatoshis };
}

/** Fixed 8-decimal form used in API responses, e.g. 1000000n → "0.01000000". */
export function formatZecFixed(zatoshis: bigint): string {
  const negative = zatoshis < 0n;
  const abs = negative ? -zatoshis : zatoshis;
  const whole = abs / ZATOSHIS_PER_ZEC;
  const fraction = (abs % ZATOSHIS_PER_ZEC).toString().padStart(8, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Shortest exact form, used in ZIP-321 URIs and UI, e.g. 1000000n → "0.01". */
export function formatZecTrimmed(zatoshis: bigint): string {
  const fixed = formatZecFixed(zatoshis);
  return fixed.replace(/\.?0+$/, "");
}

export type AmountComparison = "exact" | "under" | "over";

export function compareAmounts(received: bigint, requested: bigint): AmountComparison {
  if (received === requested) return "exact";
  return received < requested ? "under" : "over";
}
