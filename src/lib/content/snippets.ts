/**
 * Integration snippets shown on the landing page and in the docs.
 * They use only what exists in src/sdk and src/lib/webhooks — keep them in
 * sync when those change.
 */

export const SNIPPET_CREATE = `// server/checkout.ts — runs on your server, never in the browser
import { YolaClient } from "@yola/sdk";

const yola = new YolaClient({ apiKey: process.env.YOLA_SECRET_KEY! });

export async function startZecCheckout(order: { id: string; total: string }) {
  const payment = await yola.paymentRequests.create(
    {
      amount: order.total,          // decimal string, e.g. "0.25"
      currency: "ZEC",
      network: "testnet",
      description: \`Order \${order.id}\`,
      external_reference: order.id,
      expires_in: 15 * 60,
    },
    { idempotencyKey: \`order-\${order.id}\` }, // safe to retry
  );

  return payment; // id, qr_payload, payment_uri, expires_at, status_url…
}`;

export const SNIPPET_QR = `// QR codes encode exactly what the payment record says.
import QRCode from "qrcode";

const svg = await QRCode.toString(payment.qr_payload, {
  type: "svg",
  errorCorrectionLevel: "M",
  margin: 1,
});

// payment.payment_uri is a ZIP 321 URI ("zcash:…?amount=0.25") on
// testnet/mainnet, and null in the simulator, whose qr_payload uses a
// yola-demo: scheme that no wallet will treat as a real payment.`;

export const SNIPPET_STATUS = `// app/api/orders/[id]/status/route.ts — a thin proxy so the
// browser can poll without ever seeing your secret key.
import { YolaClient } from "@yola/sdk";

const yola = new YolaClient({ apiKey: process.env.YOLA_SECRET_KEY! });

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const paymentId = await lookupPaymentIdForOrder(id); // your database
  const status = await yola.paymentRequests.status(paymentId);

  // status.status: "awaiting_payment" | "payment_detected" | "confirming" | "confirmed" | …
  // status.trust_level tells you whether this is simulated or verified.
  return Response.json(status);
}`;

export const SNIPPET_WEBHOOK = `// app/api/webhooks/yola/route.ts
import { verifyWebhookSignature } from "@yola/sdk";

export async function POST(req: Request) {
  const rawBody = await req.text(); // verify the exact bytes received
  const result = verifyWebhookSignature({
    secret: process.env.YOLA_WEBHOOK_SECRET!,
    rawBody,
    header: req.headers.get("Yola-Signature"),
    toleranceSeconds: 300, // rejects replays of old deliveries
  });
  if (!result.valid) return new Response(result.reason, { status: 400 });

  const event = JSON.parse(rawBody);
  if (await alreadyProcessed(event.id)) return new Response(null, { status: 200 });

  if (event.type === "payment_request.confirmed") {
    await fulfilOrder(event.data.external_reference);
  }
  return new Response(null, { status: 200 });
}`;
