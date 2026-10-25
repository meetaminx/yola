/**
 * Identifier generation from the platform CSPRNG (Web Crypto), usable in
 * the browser, Node and edge runtimes.
 *
 * The 32-character alphabet divides 256 evenly, so mapping a random byte
 * with `b & 31` has no modulo bias. 20 characters carry 100 bits.
 */
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

export function randomToken(length = 20): string {
  const buf = new Uint8Array(length);
  globalThis.crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += ALPHABET[b & 31];
  return out;
}

export function prefixedId(prefix: string, length = 20): string {
  return `${prefix}_${randomToken(length)}`;
}
