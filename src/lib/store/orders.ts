import { createLocalGateway, type Gateway } from "@/lib/api/local-gateway";
import type { SimulateAction } from "@/lib/payments/demo-adapter";
import type { PaymentRequest, PaymentStatus, PaymentStatusResponse } from "@/lib/payments/types";
import { prefixedId } from "@/lib/utils/ids";
import { priceCart, type CartLine } from "./catalog";

/**
 * Orders for the sample store, and the backend interface the store UI uses.
 * The "local" backend runs the Yola API in the browser tab. A server-backed
 * implementation can replace it without touching the UI.
 */

export type OrderStatus = "awaiting_payment" | "payment_pending" | "paid" | "needs_attention" | "expired" | "cancelled";

export interface Order {
  id: string;
  lines: { sku: string; name: string; qty: number; unit: string; lineTotal: string }[];
  total: string;
  created_at: string;
  payment: PaymentRequest;
}

export function orderStatusFor(status: PaymentStatus): OrderStatus {
  switch (status) {
    case "created":
    case "awaiting_payment":
      return "awaiting_payment";
    case "payment_detected":
    case "confirming":
    case "underpaid":
      return "payment_pending";
    case "confirmed":
    case "overpaid":
      return "paid";
    case "verification_required":
    case "failed":
      return "needs_attention";
    case "expired":
      return "expired";
    case "cancelled":
      return "cancelled";
  }
}

export const ORDER_STATUS_COPY: Record<OrderStatus, { title: string; body: string }> = {
  awaiting_payment: { title: "Awaiting payment", body: "Your order is reserved until the payment request expires." },
  payment_pending: { title: "Payment in progress", body: "We are waiting for the payment to be confirmed." },
  paid: { title: "Order confirmed", body: "Payment received. Your order is being prepared." },
  needs_attention: { title: "Order on hold", body: "The payment needs a manual check before we can ship." },
  expired: { title: "Payment window closed", body: "No complete payment arrived in time, so the order was not placed." },
  cancelled: { title: "Order cancelled", body: "This order was cancelled before payment." },
};

export class StoreError extends Error {}

export interface StoreBackend {
  readonly mode: "local" | "server";
  createOrder(lines: CartLine[]): Promise<Order>;
  getOrder(orderId: string): Promise<Order | null>;
  fetchStatus(paymentId: string, signal?: AbortSignal): Promise<PaymentStatusResponse>;
  simulate(orderId: string, action: SimulateAction): Promise<Order>;
  cancelOrder(orderId: string): Promise<Order>;
}

type ErrorBody = { error?: { message?: string } };
const messageOf = (body: unknown, fallback: string) => (body as ErrorBody)?.error?.message ?? fallback;

/** Runs the Yola API inside the tab. Orders live in memory and disappear on reload. */
export function createLocalStoreBackend(gateway: Gateway = createLocalGateway({ latencyMs: 250 })): StoreBackend {
  const orders = new Map<string, Order>();

  async function refresh(order: Order): Promise<Order> {
    const res = await gateway.call({ method: "GET", path: `/payment-requests/${order.payment.id}` });
    if (res.status !== 200) throw new StoreError(messageOf(res.body, "Could not load the payment."));
    const next = { ...order, payment: res.body as PaymentRequest };
    orders.set(order.id, next);
    return next;
  }

  return {
    mode: "local",
    async createOrder(cartLines) {
      let priced;
      try {
        priced = priceCart(cartLines);
      } catch (err) {
        throw new StoreError(err instanceof Error ? err.message : "The cart is invalid.");
      }
      const orderId = prefixedId("ord", 10);
      const res = await gateway.call({
        method: "POST",
        path: "/payment-requests",
        idempotencyKey: `order-${orderId}`,
        body: {
          amount: priced.total,
          currency: "ZEC",
          network: "demo",
          description: `Fernhill Supply order ${orderId.slice(4).toUpperCase()}`,
          external_reference: orderId,
          expires_in: 15 * 60,
          metadata: { items: String(cartLines.reduce((n, l) => n + l.qty, 0)) },
        },
      });
      if (res.status !== 201) throw new StoreError(messageOf(res.body, "The payment request could not be created."));
      const order: Order = {
        id: orderId,
        lines: priced.lines.map(({ sku, name, qty, unit, lineTotal }) => ({ sku, name, qty, unit, lineTotal })),
        total: priced.total,
        created_at: new Date().toISOString(),
        payment: res.body as PaymentRequest,
      };
      orders.set(orderId, order);
      return order;
    },
    async getOrder(orderId) {
      const order = orders.get(orderId);
      return order ? refresh(order) : null;
    },
    async fetchStatus(paymentId) {
      const res = await gateway.call({ method: "GET", path: `/payment-requests/${paymentId}/status` });
      if (res.status !== 200) throw new StoreError(messageOf(res.body, "Status check failed."));
      return res.body as PaymentStatusResponse;
    },
    async simulate(orderId, action) {
      const order = orders.get(orderId);
      if (!order) throw new StoreError("Order not found.");
      const res = await gateway.call({ method: "POST", path: `/payment-requests/${order.payment.id}/simulate`, body: { action } });
      if (res.status !== 200) throw new StoreError(messageOf(res.body, "The simulator could not do that."));
      const next = { ...order, payment: res.body as PaymentRequest };
      orders.set(orderId, next);
      return next;
    },
    async cancelOrder(orderId) {
      const order = orders.get(orderId);
      if (!order) throw new StoreError("Order not found.");
      const res = await gateway.call({ method: "POST", path: `/payment-requests/${order.payment.id}/cancel` });
      if (res.status !== 200) throw new StoreError(messageOf(res.body, "The order could not be cancelled."));
      const next = { ...order, payment: res.body as PaymentRequest };
      orders.set(orderId, next);
      return next;
    },
  };
}
