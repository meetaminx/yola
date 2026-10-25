import { DocPage, Status } from "@/components/docs/docs-ui";
import { CodeBlock } from "@/components/ui/code-block";
import { SNIPPET_WEBHOOK } from "@/lib/content/snippets";

export const metadata = { title: "Webhooks" };

export default function WebhooksGuide() {
  return (
    <DocPage
      title="Webhooks"
      lead="Yola notifies your server when a payment’s status changes. Every delivery is signed so you can prove it came from Yola."
    >
      <Status>Signature verification works today. Delivery and retries ship in build stage 3.</Status>

      <h2>Signature format</h2>
      <CodeBlock lang="http" filename="Header" code={`# secret "whsec_example", body {"id":"evt_example"}
Yola-Signature: t=1792900800,v1=bc5f16b3a7fd59d0e58cdaf92880827f9eefa05e29ca6945ca929dfc2e9b93ab`} />
      <p>
        <code>v1</code> is the hex HMAC-SHA256 of <code>{"`${t}.${rawBody}`"}</code> using your endpoint’s signing
        secret. During secret rotation a header can contain several <code>v1</code> values; any match is valid.
      </p>

      <h2>Verifying a delivery</h2>
      <CodeBlock code={SNIPPET_WEBHOOK} filename="app/api/webhooks/yola/route.ts" />
      <ol>
        <li>Read the raw body before parsing JSON. Re-serialised JSON will not match the signature.</li>
        <li>Reject timestamps more than five minutes from now. This blocks replays of old deliveries.</li>
        <li>Store processed event IDs and ignore repeats. Deliveries are at-least-once.</li>
        <li>Fulfil orders only on <code>payment_request.confirmed</code>, never on <code>payment_detected</code>.</li>
      </ol>

      <h2>Events</h2>
      <table>
        <thead><tr><th>Event</th><th>When</th></tr></thead>
        <tbody>
          <tr><td><code>payment_request.payment_detected</code></td><td>A matching output was observed. Not final.</td></tr>
          <tr><td><code>payment_request.confirmed</code></td><td>Amount and confirmation policy met.</td></tr>
          <tr><td><code>payment_request.underpaid</code> / <code>.overpaid</code></td><td>Amount differs from the request.</td></tr>
          <tr><td><code>payment_request.expired</code> / <code>.cancelled</code></td><td>The request closed without payment.</td></tr>
          <tr><td><code>payment_request.verification_required</code></td><td>Needs human review, e.g. a late payment or a deep reorg.</td></tr>
        </tbody>
      </table>

      <h2>Destinations</h2>
      <p>
        Webhook URLs must use HTTPS and resolve to public addresses. Yola refuses private, loopback, link-local and
        cloud metadata addresses, and re-checks the resolved address at delivery time to block DNS rebinding.
      </p>
    </DocPage>
  );
}
