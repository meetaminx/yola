import "server-only";

/** Testnet backend health. Replaced by the real adapter check in the testnet phase. */
export async function testnetHealth(): Promise<"available" | "unreachable" | "not_configured"> {
  return "not_configured";
}
