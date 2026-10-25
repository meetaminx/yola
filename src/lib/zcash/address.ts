/**
 * Address *shape* classification by encoding prefix.
 *
 * IMPORTANT: this is not validation. It does not check Bech32/Bech32m
 * checksums, F4Jumble, Base58Check, or receiver contents. It exists to give
 * fast, honest feedback (wrong network, unsupported type) before the
 * request reaches a verification backend, which must perform full
 * validation with a maintained Zcash library (e.g. librustzcash's
 * zcash_address via the configured backend). Never treat a "recognized"
 * result as proof that an address is valid or spendable.
 *
 * Prefixes from the Zcash protocol spec §5.6, ZIP 173 (Sapling),
 * ZIP 316 (Unified, including Revision 2 HRPs "zu"/"tu") and ZIP 320 (TEX).
 */

export type ZcashNetwork = "mainnet" | "testnet";

export type AddressKind =
  | "unified" // ZIP 316 Revision 0 ("u")
  | "unified_shielded" // ZIP 316 Revision 2, shielded-only ("zu")
  | "unified_transparent" // ZIP 316 Revision 2, transparent-enabled ("tu")
  | "sapling"
  | "transparent_p2pkh"
  | "transparent_p2sh"
  | "tex";

export interface AddressShape {
  kind: AddressKind;
  network: ZcashNetwork;
  /** Whether outputs to this kind of address can carry an encrypted memo. */
  supportsMemo: boolean;
  /** Whether the receiver's amounts and destination are publicly visible on chain. */
  shieldedReceiver: "yes" | "no" | "depends_on_receivers";
}

export type AddressClassification =
  | { recognized: true; shape: AddressShape }
  | { recognized: false; reason: "empty" | "sprout_unsupported" | "unrecognized_prefix" | "bad_charset" };

// Bech32/Bech32m: HRP + "1" + data from the 32-char alphabet (no 1, b, i, o).
const BECH32_DATA = /^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/;
// Base58: no 0, O, I, l.
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

const BECH32_RULES: Array<{ hrp: string; kind: AddressKind; network: ZcashNetwork }> = [
  // Longest HRPs first so "utest" is not mistaken for "u".
  { hrp: "ztestsapling", kind: "sapling", network: "testnet" },
  { hrp: "textest", kind: "tex", network: "testnet" },
  { hrp: "zutest", kind: "unified_shielded", network: "testnet" },
  { hrp: "tutest", kind: "unified_transparent", network: "testnet" },
  { hrp: "utest", kind: "unified", network: "testnet" },
  { hrp: "zs", kind: "sapling", network: "mainnet" },
  { hrp: "tex", kind: "tex", network: "mainnet" },
  { hrp: "zu", kind: "unified_shielded", network: "mainnet" },
  { hrp: "tu", kind: "unified_transparent", network: "mainnet" },
  { hrp: "u", kind: "unified", network: "mainnet" },
];

function shapeFor(kind: AddressKind, network: ZcashNetwork): AddressShape {
  switch (kind) {
    case "sapling":
    case "unified_shielded":
      return { kind, network, supportsMemo: true, shieldedReceiver: "yes" };
    case "unified":
    case "unified_transparent":
      // A UA may contain a transparent receiver; the sender's wallet picks the receiver.
      return { kind, network, supportsMemo: true, shieldedReceiver: "depends_on_receivers" };
    case "transparent_p2pkh":
    case "transparent_p2sh":
    case "tex":
      return { kind, network, supportsMemo: false, shieldedReceiver: "no" };
  }
}

export function classifyAddress(raw: string): AddressClassification {
  const value = raw.trim();
  if (value === "") return { recognized: false, reason: "empty" };

  const lower = value.toLowerCase();
  if (lower.startsWith("zc") || lower.startsWith("zt")) {
    // Sprout ("zc…" mainnet, "zt…" testnet). ZIP 321 forbids Sprout in payment requests.
    // "ztestsapling" is handled below, so only reject when it is not Sapling.
    if (!lower.startsWith("ztestsapling1")) return { recognized: false, reason: "sprout_unsupported" };
  }

  const sep = lower.lastIndexOf("1");
  if (sep > 0) {
    const hrp = lower.slice(0, sep);
    const rule = BECH32_RULES.find((r) => r.hrp === hrp);
    if (rule) {
      // Bech32 strings must not mix case.
      if (value !== lower && value !== value.toUpperCase()) return { recognized: false, reason: "bad_charset" };
      if (!BECH32_DATA.test(lower.slice(sep + 1))) return { recognized: false, reason: "bad_charset" };
      return { recognized: true, shape: shapeFor(rule.kind, rule.network) };
    }
  }

  // Transparent Base58Check: t1 (mainnet P2PKH), t3 (mainnet P2SH), tm (testnet P2PKH), t2 (testnet P2SH).
  const tPrefix = value.slice(0, 2);
  const tRules: Record<string, { kind: AddressKind; network: ZcashNetwork }> = {
    t1: { kind: "transparent_p2pkh", network: "mainnet" },
    t3: { kind: "transparent_p2sh", network: "mainnet" },
    tm: { kind: "transparent_p2pkh", network: "testnet" },
    t2: { kind: "transparent_p2sh", network: "testnet" },
  };
  const t = tRules[tPrefix];
  if (t) {
    if (!BASE58.test(value) || value.length !== 35) return { recognized: false, reason: "bad_charset" };
    return { recognized: true, shape: shapeFor(t.kind, t.network) };
  }

  return { recognized: false, reason: "unrecognized_prefix" };
}

export const ADDRESS_KIND_LABEL: Record<AddressKind, string> = {
  unified: "Unified address",
  unified_shielded: "Unified address (shielded-only)",
  unified_transparent: "Unified address (transparent-enabled)",
  sapling: "Sapling shielded address",
  transparent_p2pkh: "Transparent address",
  transparent_p2sh: "Transparent script address",
  tex: "TEX transparent-source-only address",
};
