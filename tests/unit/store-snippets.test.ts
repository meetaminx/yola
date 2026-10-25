import { describe, expect, it } from "vitest";
import { generateSnippet } from "@/lib/content/request-snippets";
import { createLocalStoreBackend, orderStatusFor } from "@/lib/store/orders";
import { priceCart } from "@/lib/store/catalog";

describe("cart pricing", () => {
  it("prices from the catalog with exact integers", () => {
    const r = priceCart([
      { sku: "FN-MG-02", qty: 1 },
      { sku: "FN-NB-01", qty: 2 },
    ]);
    expect(r.total).toBe("0.149");
    expect(r.totalZatoshis).toBe(14_900_000n);
  });

  it("rejects unknown products, bad quantities and empty carts", () => {
    expect(() => priceCart([])).toThrow(/empty/);
    expect(() => priceCart([{ sku: "NOPE", qty: 1 }])).toThrow(/Unknown/);
    expect(() => priceCart([{ sku: "FN-MG-02", qty: 0 }])).toThrow(/Quantity/);
    expect(() => priceCart([{ sku: "FN-MG-02", qty: 1.5 }])).toThrow(/Quantity/);
    expect(() => priceCart([{ sku: "FN-MG-02", qty: 11 }])).toThrow(/Quantity/);
  });
});

describe("local store backend", () => {
  it("creates an order whose payment amount equals the priced cart", async () => {
    const store = createLocalStoreBackend();
    const order = await store.createOrder([{ sku: "FN-TB-03", qty: 2 }]);
    expect(order.total).toBe("0.36");
    expect(order.payment.amount).toBe("0.36000000");
    expect(order.payment.external_reference).toBe(order.id);
    expect(order.payment.qr_payload).toContain("amount=0.36");
    expect(orderStatusFor(order.payment.status)).toBe("awaiting_payment");

    let o = await store.simulate(order.id, "pay");
    for (let i = 0; i < 3; i++) o = await store.simulate(order.id, "mine_block");
    expect(orderStatusFor(o.payment.status)).toBe("paid");
    expect((await store.fetchStatus(o.payment.id)).final).toBe(true);
  });

  it("returns null for unknown orders", async () => {
    expect(await createLocalStoreBackend().getOrder("ord_missing")).toBeNull();
  });
});

describe("request snippets", () => {
  const base = { baseUrl: "https://yola.example", idempotencyKey: "order-1" };
  const body = { amount: "0.25", currency: "ZEC", network: "demo" };

  it("cURL includes auth, idempotency and the JSON body", () => {
    const s = generateSnippet("curl", { ...base, operation: "create", method: "POST", path: "/payment-requests", body });
    expect(s).toContain("curl -X POST 'https://yola.example/api/v1/payment-requests'");
    expect(s).toContain('-H "Authorization: Bearer $YOLA_SECRET_KEY"');
    expect(s).toContain('-H "Idempotency-Key: order-1"');
    expect(s).toContain(`-d '${JSON.stringify(body)}'`);
  });

  it("escapes single quotes for the shell", () => {
    const s = generateSnippet("curl", { ...base, operation: "create", method: "POST", path: "/payment-requests", body: { description: "Ana's order" } });
    expect(s).toContain(`Ana'\\''s order`);
  });

  it("TypeScript maps every operation to a real SDK method", () => {
    const ts = (operation: Parameters<typeof generateSnippet>[1]["operation"], path: string, b?: unknown) =>
      generateSnippet("typescript", { baseUrl: base.baseUrl, operation, method: "GET", path, body: b });
    expect(ts("retrieve", "/payment-requests/pay_demo_x")).toContain('yola.paymentRequests.retrieve("pay_demo_x")');
    expect(ts("status", "/payment-requests/pay_demo_x/status")).toContain('yola.paymentRequests.status("pay_demo_x")');
    expect(ts("cancel", "/payment-requests/pay_demo_x/cancel")).toContain('yola.paymentRequests.cancel("pay_demo_x")');
    expect(ts("simulate", "/payment-requests/pay_demo_x/simulate", { action: "mine_block" })).toContain(
      'yola.paymentRequests.simulate("pay_demo_x", "mine_block")',
    );
    expect(ts("list", "/payment-requests?limit=10&status=confirmed")).toContain('list({\n  limit: 10,\n  status: "confirmed"\n})');
  });

  it("Python uses requests with a timeout and raises on errors", () => {
    const s = generateSnippet("python", { ...base, operation: "create", method: "POST", path: "/payment-requests", body });
    expect(s).toContain("requests.post(");
    expect(s).toContain('"Idempotency-Key": "order-1"');
    expect(s).toContain("timeout=15");
    expect(s).toContain("raise RuntimeError");
  });
});
