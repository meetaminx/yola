import { describe, expect, it, vi } from "vitest";
import { signPayload, verifySignature } from "@/lib/webhooks/signature";
import { YolaApiError, YolaClient } from "@/sdk";

describe("webhook signatures", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "evt_1", type: "payment_request.confirmed" });
  const t = 1_800_000_000;

  it("verifies a valid signature", () => {
    const header = signPayload(secret, body, t);
    expect(verifySignature({ secret, rawBody: body, header, now: t + 10 })).toEqual({ valid: true, timestamp: t });
  });

  it("rejects tampered bodies, wrong secrets and stale timestamps", () => {
    const header = signPayload(secret, body, t);
    expect(verifySignature({ secret, rawBody: body + " ", header, now: t }).valid).toBe(false);
    expect(verifySignature({ secret: "other", rawBody: body, header, now: t }).valid).toBe(false);
    expect(verifySignature({ secret, rawBody: body, header, now: t + 301 })).toEqual({
      valid: false,
      reason: "timestamp_out_of_range",
    });
    expect(verifySignature({ secret, rawBody: body, header: "garbage", now: t })).toEqual({
      valid: false,
      reason: "malformed_header",
    });
  });
});

describe("YolaClient", () => {
  it("sends auth and idempotency headers to /api/v1", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "pay_1" }), { status: 201 }));
    const yola = new YolaClient({ apiKey: "ysk_test_123", baseUrl: "https://api.example", fetch: fetchMock });
    await yola.paymentRequests.create(
      { amount: "0.01", currency: "ZEC", network: "demo" },
      { idempotencyKey: "order_42" },
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.example/api/v1/payment-requests");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer ysk_test_123");
    expect(headers["Idempotency-Key"]).toBe("order_42");
  });

  it("validates amounts before calling the API", async () => {
    const fetchMock = vi.fn();
    const yola = new YolaClient({ apiKey: "ysk_test", fetch: fetchMock });
    await expect(
      yola.paymentRequests.create({ amount: "0.1e1", currency: "ZEC", network: "demo" }),
    ).rejects.toBeInstanceOf(YolaApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces structured API errors", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: { code: "network_mismatch", message: "Mainnet address on testnet.", request_id: "req_9" } }),
          { status: 422 },
        ),
    );
    const yola = new YolaClient({ apiKey: "ysk_test", fetch: fetchMock });
    await expect(
      yola.paymentRequests.create({ amount: "1", currency: "ZEC", network: "testnet", destination: "u1abc" }),
    ).rejects.toMatchObject({ status: 422, code: "network_mismatch", requestId: "req_9" });
  });

  it("refuses a secret key in a browser", () => {
    vi.stubGlobal("window", {});
    expect(() => new YolaClient({ apiKey: "ysk_live_x" })).toThrow(/browser/);
    vi.unstubAllGlobals();
  });
});
