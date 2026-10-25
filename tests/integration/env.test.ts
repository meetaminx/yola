import { afterEach, describe, expect, it } from "vitest";
import { EnvError, getEnv, resetEnvCache } from "@/lib/server/env";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  resetEnvCache();
});

function withEnv(vars: Record<string, string>) {
  process.env = { ...saved, ...vars };
  resetEnvCache();
  return () => getEnv();
}

describe("environment validation", () => {
  it("requires the scanner URL and a strong token when testnet is enabled", () => {
    expect(withEnv({ YOLA_TESTNET_ENABLED: "true" })).toThrow(EnvError);
    expect(withEnv({ YOLA_TESTNET_ENABLED: "true", ZCASH_BACKEND_URL: "http://127.0.0.1:9077", ZCASH_BACKEND_AUTH_TOKEN: "short" })).toThrow(/ZCASH_BACKEND_AUTH_TOKEN/);
    const env = withEnv({ YOLA_TESTNET_ENABLED: "true", ZCASH_BACKEND_URL: "http://127.0.0.1:9077", ZCASH_BACKEND_AUTH_TOKEN: "x".repeat(32) })();
    expect(env.YOLA_TESTNET_ENABLED).toBe(true);
  });

  it("refuses to enable mainnet", () => {
    expect(withEnv({ YOLA_MAINNET_ENABLED: "true" })).toThrow(/MAINNET/);
  });
});
