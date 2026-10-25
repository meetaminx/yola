import { serializeStatus } from "@/lib/payments/service";
import type { PaymentRequest, PaymentStatus } from "@/lib/payments/types";

/**
 * Webhook event payloads. The body is built once, stored, and delivered
 * byte-for-byte on every attempt, so the signature always matches.
 */

export const WEBHOOK_EVENT_TYPES = [
  "payment_request.created",
  "payment_request.awaiting_payment",
  "payment_request.payment_detected",
  "payment_request.confirming",
  "payment_request.confirmed",
  "payment_request.underpaid",
  "payment_request.overpaid",
  "payment_request.expired",
  "payment_request.cancelled",
  "payment_request.failed",
  "payment_request.verification_required",
  "webhook.test",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export function eventTypeFor(status: PaymentStatus): WebhookEventType {
  return `payment_request.${status}` as WebhookEventType;
}

export interface WebhookPayload {
  id: string;
  type: WebhookEventType;
  created_at: string;
  /** Mirrors the payment's trust level. Fulfil orders only on verified_* payments in production. */
  livemode: boolean;
  data: {
    payment_request: ReturnType<typeof serializeStatus> & {
      external_reference: string | null;
      metadata: Record<string, string>;
    };
  } | { test: true; message: string };
}

export function paymentEventPayload(id: string, type: WebhookEventType, at: string, p: PaymentRequest): WebhookPayload {
  return {
    id,
    type,
    created_at: at,
    livemode: p.trust_level === "verified_mainnet",
    data: {
      payment_request: { ...serializeStatus(p), external_reference: p.external_reference, metadata: p.metadata },
    },
  };
}

export function testEventPayload(id: string, at: string): WebhookPayload {
  return {
    id,
    type: "webhook.test",
    created_at: at,
    livemode: false,
    data: { test: true, message: "This is a test event from Yola. It does not describe a real payment." },
  };
}
