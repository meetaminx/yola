import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Webhook signatures (server-side only).
 *
 * Header:  Yola-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>
 * Signed:  `${t}.${rawBody}`
 *
 * Receivers verify the HMAC with a constant-time comparison, reject
 * timestamps outside the tolerance window, and de-duplicate on the
 * event ID to prevent replays inside the window.
 */

export const SIGNATURE_HEADER = "Yola-Signature";
export const DEFAULT_TOLERANCE_SECONDS = 300;

export function signPayload(secret: string, rawBody: string, timestamp: number): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

export type VerifyResult =
  | { valid: true; timestamp: number }
  | { valid: false; reason: "malformed_header" | "timestamp_out_of_range" | "signature_mismatch" };

export function verifySignature(options: {
  secret: string;
  rawBody: string;
  header: string | null | undefined;
  toleranceSeconds?: number;
  now?: number; // unix seconds, for tests
}): VerifyResult {
  const { secret, rawBody, header } = options;
  if (!header) return { valid: false, reason: "malformed_header" };

  let timestamp: number | undefined;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t" && value && /^\d+$/.test(value)) timestamp = Number(value);
    if (key === "v1" && value && /^[0-9a-f]{64}$/.test(value)) signatures.push(value);
  }
  if (timestamp === undefined || signatures.length === 0) return { valid: false, reason: "malformed_header" };

  const now = options.now ?? Math.floor(Date.now() / 1000);
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  if (Math.abs(now - timestamp) > tolerance) return { valid: false, reason: "timestamp_out_of_range" };

  const expected = Buffer.from(
    createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex"),
    "utf8",
  );
  // Several v1 entries allow secret rotation.
  const match = signatures.some((sig) => {
    const given = Buffer.from(sig, "utf8");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  return match ? { valid: true, timestamp } : { valid: false, reason: "signature_mismatch" };
}
