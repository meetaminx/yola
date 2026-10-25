import { describe, expect, it } from "vitest";
import { classifyAddress } from "@/lib/zcash/address";
import { buildZip321Uri, encodeQchar } from "@/lib/zcash/zip321";

// Example addresses taken verbatim from the ZIP 321 specification.
const SAPLING_TEST = "ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez";
const T_TEST = "tmEZhbWHTpdKMw5it8YDspUXSMGQyFwovpU";

describe("classifyAddress (shape only)", () => {
  it("recognizes spec example addresses and their network", () => {
    const s = classifyAddress(SAPLING_TEST);
    expect(s.recognized && s.shape.kind).toBe("sapling");
    expect(s.recognized && s.shape.network).toBe("testnet");
    const t = classifyAddress(T_TEST);
    expect(t.recognized && t.shape.kind).toBe("transparent_p2pkh");
    expect(t.recognized && t.shape.supportsMemo).toBe(false);
  });

  it("distinguishes ZIP 316 revision 2 prefixes", () => {
    const zu = classifyAddress("zutest1qqqqqqqq");
    expect(zu.recognized && zu.shape.kind).toBe("unified_shielded");
    const u = classifyAddress("utest1qqqqqqqq");
    expect(u.recognized && u.shape.kind).toBe("unified");
    const main = classifyAddress("u1qqqqqqqq");
    expect(main.recognized && main.shape.network).toBe("mainnet");
  });

  it("rejects Sprout, junk and bad charsets", () => {
    expect(classifyAddress("zcAbc").recognized).toBe(false);
    expect(classifyAddress("hello").recognized).toBe(false);
    expect(classifyAddress("utest1bbbb").recognized).toBe(false); // "b" is not Bech32
  });
});

describe("buildZip321Uri", () => {
  it("reproduces the ZIP 321 single-payment example", () => {
    const r = buildZip321Uri({
      address: SAPLING_TEST,
      network: "testnet",
      amountZatoshis: 100_000_000n,
      memo: new TextEncoder().encode("This is a simple memo."),
      message: "Thank you for your purchase",
    });
    expect(r).toEqual({
      ok: true,
      uri: `zcash:${SAPLING_TEST}?amount=1&memo=VGhpcyBpcyBhIHNpbXBsZSBtZW1vLg&message=Thank%20you%20for%20your%20purchase`,
    });
  });

  it("rejects memos for transparent recipients", () => {
    const r = buildZip321Uri({
      address: T_TEST,
      network: "testnet",
      amountZatoshis: 1n,
      memo: new Uint8Array([1]),
    });
    expect(r.ok === false && r.code).toBe("memo_not_allowed");
  });

  it("rejects network mismatches", () => {
    const r = buildZip321Uri({ address: SAPLING_TEST, network: "mainnet", amountZatoshis: 1n });
    expect(r.ok === false && r.code).toBe("network_mismatch");
  });

  it("percent-encodes only outside qchar", () => {
    expect(encodeQchar("a b&c=d/é")).toBe("a%20b%26c%3Dd%2F%C3%A9");
  });
});
