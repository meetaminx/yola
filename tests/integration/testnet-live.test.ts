import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createScannerClient } from "@/lib/server/zcash/scanner-client";

/**
 * Opt-in: runs only against a real scanner connected to a real testnet
 * lightwalletd or Zaino server.
 *
 *   YOLA_LIVE_SCANNER_URL=http://127.0.0.1:9077 YOLA_LIVE_SCANNER_TOKEN=... pnpm test:integration testnet-live
 *
 * Uses the public test key in tests/fixtures (never fund it). It checks the
 * backend really is testnet, that address derivation matches the fixtures,
 * and that recent blocks scan cleanly.
 */

const url = process.env.YOLA_LIVE_SCANNER_URL;
const token = process.env.YOLA_LIVE_SCANNER_TOKEN ?? "";
const fx = JSON.parse(readFileSync(new URL("../fixtures/zcash-testnet.json", import.meta.url), "utf8"));

describe.skipIf(!url)("live testnet scanner", () => {
  const scanner = createScannerClient({ baseUrl: url ?? "", token });

  it("is connected to testnet", async () => {
    const h = await scanner.health();
    expect(h).toMatchObject({ status: "ok", chain_name: "test" });
    expect(h.tip_height).toBeGreaterThan(3_000_000);
  });

  it("validates keys and derives the same addresses as the fixtures", async () => {
    const k = await scanner.inspectKey(fx.ufvk);
    expect(k).toMatchObject({ uivk: fx.uivk, fingerprint: fx.fingerprint, was_full_viewing_key: true, first_address: fx.first_address });
    for (const a of fx.addresses) {
      expect(await scanner.deriveAddress(fx.uivk, a.requested)).toEqual({ address: a.address, index: a.index });
    }
  });

  it("scans recent blocks and the mempool", async () => {
    const tip = (await scanner.health()).tip_height!;
    const res = await scanner.scan(tip - 9, tip, [{ id: "live", uivk: fx.uivk }]);
    expect(res.blocks).toHaveLength(10);
    for (let i = 1; i < res.blocks.length; i++) expect(res.blocks[i]!.prev_hash).toBe(res.blocks[i - 1]!.hash);
    const mp = await scanner.mempool([{ id: "live", uivk: fx.uivk }]);
    expect(mp.tip_height).toBeGreaterThanOrEqual(tip);
  });
});
