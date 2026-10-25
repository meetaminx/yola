import { DocPage, Status } from "@/components/docs/docs-ui";
import { CodeBlock } from "@/components/ui/code-block";

export const metadata = { title: "API reference" };

const ENDPOINTS = [
  ["POST", "/api/v1/payment-requests", "Create a payment request"],
  ["GET", "/api/v1/payment-requests", "List payment requests (cursor pagination)"],
  ["GET", "/api/v1/payment-requests/:id", "Retrieve a payment request"],
  ["GET", "/api/v1/payment-requests/:id/status", "Lightweight status for polling"],
  ["POST", "/api/v1/payment-requests/:id/cancel", "Cancel an open request"],
  ["POST", "/api/v1/webhooks/test", "Send a signed test event"],
  ["GET", "/api/v1/health", "Service and adapter health"],
];

export default function ApiReference() {
  return (
    <DocPage title="API reference" lead="A versioned REST API under /api/v1. JSON in, JSON out, exact decimal strings for money.">
      <Status>Contract fixed. Route handlers ship in build stage 3.</Status>

      <h2>Endpoints</h2>
      <table>
        <thead><tr><th>Method</th><th>Path</th><th>Purpose</th></tr></thead>
        <tbody>
          {ENDPOINTS.map(([m, p, d]) => (
            <tr key={m + p}><td><code>{m}</code></td><td><code>{p}</code></td><td>{d}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>Authentication</h2>
      <p>
        Send your secret key as a bearer token: <code>Authorization: Bearer ysk_…</code>. Secret keys are shown
        once at creation and stored only as hashes. Test and live keys are separate and only work against their own
        environment.
      </p>

      <h2>Create a payment request</h2>
      <CodeBlock
        lang="http"
        filename="Request"
        code={`POST /api/v1/payment-requests
Authorization: Bearer ysk_test_…
Idempotency-Key: order-1042
Content-Type: application/json

{
  "amount": "0.25",
  "currency": "ZEC",
  "network": "testnet",
  "description": "Order 1042",
  "external_reference": "1042",
  "expires_in": 900
}`}
      />
      <p>
        <code>amount</code> must be a decimal string with at most 8 decimal places. Floats such as{" "}
        <code>0.25</code> (unquoted) are rejected. On testnet and mainnet, Yola derives the receiving address from
        your project’s viewing key, so you do not pass a destination.
      </p>
      <CodeBlock
        lang="json"
        filename="201 Created"
        code={`{
  "id": "pay_…",
  "amount": "0.25000000",
  "amount_zatoshis": "25000000",
  "currency": "ZEC",
  "network": "testnet",
  "trust_level": "verified_testnet",
  "destination": "utest1…",
  "description": "Order 1042",
  "external_reference": "1042",
  "status": "awaiting_payment",
  "created_at": "2026-10-25T10:00:00.000Z",
  "expires_at": "2026-10-25T10:15:00.000Z",
  "payment_uri": "zcash:utest1…?amount=0.25&message=Order%201042",
  "qr_payload": "zcash:utest1…?amount=0.25&message=Order%201042",
  "status_url": "/api/v1/payment-requests/pay_…/status",
  "confirmations": null,
  "amount_received_zatoshis": null,
  "transaction_id": null
}`}
      />

      <h2>Idempotency</h2>
      <p>
        Send an <code>Idempotency-Key</code> header on creation. Repeating the request with the same key and
        identical body returns the original payment request. Reusing the key with a different body returns{" "}
        <code>409 idempotency_conflict</code>. Keys are kept for 24 hours.
      </p>

      <h2>Errors</h2>
      <CodeBlock
        lang="json"
        filename="422 Unprocessable Entity"
        code={`{
  "error": {
    "code": "amount_precision",
    "message": "ZEC supports at most 8 decimal places (1 zatoshi = 0.00000001 ZEC).",
    "fields": { "amount": "ZEC supports at most 8 decimal places (1 zatoshi = 0.00000001 ZEC)." },
    "request_id": "req_…"
  }
}`}
      />
      <table>
        <thead><tr><th>HTTP</th><th>Meaning</th></tr></thead>
        <tbody>
          <tr><td>400 / 422</td><td>Invalid input. <code>fields</code> names the problem fields.</td></tr>
          <tr><td>401</td><td>Missing or invalid API key.</td></tr>
          <tr><td>404</td><td>No such payment request in this project.</td></tr>
          <tr><td>409</td><td>Idempotency conflict, or an action the current status does not allow.</td></tr>
          <tr><td>429</td><td>Rate limited. Retry after the <code>Retry-After</code> header.</td></tr>
          <tr><td>503</td><td>The network adapter for this environment is unavailable or not configured.</td></tr>
        </tbody>
      </table>
    </DocPage>
  );
}
