import { formatZecTrimmed, MAX_ZEC_ZATOSHIS } from "@/lib/payments/amount";
import { classifyAddress, type ZcashNetwork } from "./address";

/**
 * ZIP 321 payment request URI construction, single-recipient form:
 *
 *   zcashurn = "zcash:" zcashaddress [ "?" zcashparams ]
 *
 * Rules applied (from ZIP 321):
 * - amount: 1*DIGIT [ "." 1*8DIGIT ], ≤ 21,000,000 ZEC.
 * - memo: base64url WITHOUT padding, decoded ≤ 512 bytes, and the whole URI is
 *   invalid if the recipient cannot receive memos (transparent addresses).
 * - label / message: percent-encoding is only permitted in qchar productions.
 * - Sprout addresses MUST NOT be used.
 * - If the network context is known, the address SHOULD match it.
 */

export interface Zip321Input {
  address: string;
  network: ZcashNetwork;
  amountZatoshis: bigint;
  /** Shown by the payer's wallet. Keep it free of personal or sensitive data. */
  message?: string;
  label?: string;
  /** Raw memo bytes (UTF-8 text is fine). Only for shielded-capable recipients. */
  memo?: Uint8Array;
}

export type Zip321Result =
  | { ok: true; uri: string }
  | { ok: false; code: Zip321ErrorCode; message: string };

export type Zip321ErrorCode =
  | "address_unrecognized"
  | "network_mismatch"
  | "amount_invalid"
  | "memo_not_allowed"
  | "memo_too_long";

// RFC 3986 unreserved plus ZIP 321 allowed-delims, ":" and "@" may appear literally.
const QCHAR_LITERAL = /[A-Za-z0-9\-._~!$'()*+,;:@]/;

export function encodeQchar(value: string): string {
  let out = "";
  for (const ch of value) {
    if (QCHAR_LITERAL.test(ch)) {
      out += ch;
    } else {
      for (const byte of new TextEncoder().encode(ch)) {
        out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
      }
    }
  }
  return out;
}

export function base64urlNoPad(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildZip321Uri(input: Zip321Input): Zip321Result {
  const cls = classifyAddress(input.address);
  if (!cls.recognized) {
    return {
      ok: false,
      code: "address_unrecognized",
      message:
        cls.reason === "sprout_unsupported"
          ? "Sprout addresses cannot be used in payment requests."
          : "This does not look like a supported Zcash address.",
    };
  }
  if (cls.shape.network !== input.network) {
    return {
      ok: false,
      code: "network_mismatch",
      message: `This is a ${cls.shape.network} address, but the request is for ${input.network}.`,
    };
  }
  if (input.amountZatoshis <= 0n || input.amountZatoshis > MAX_ZEC_ZATOSHIS) {
    return { ok: false, code: "amount_invalid", message: "Amount must be between 0.00000001 and 21,000,000 ZEC." };
  }

  const params: string[] = [`amount=${formatZecTrimmed(input.amountZatoshis)}`];

  if (input.memo && input.memo.length > 0) {
    if (!cls.shape.supportsMemo) {
      return { ok: false, code: "memo_not_allowed", message: "Transparent addresses cannot receive memos." };
    }
    if (input.memo.length > 512) {
      return { ok: false, code: "memo_too_long", message: "Memos are limited to 512 bytes." };
    }
    params.push(`memo=${base64urlNoPad(input.memo)}`);
  }
  if (input.label) params.push(`label=${encodeQchar(input.label)}`);
  if (input.message) params.push(`message=${encodeQchar(input.message)}`);

  return { ok: true, uri: `zcash:${input.address.trim()}?${params.join("&")}` };
}
