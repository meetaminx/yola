import { Callout, DocPage } from "@/components/docs/docs-ui";

export const metadata = { title: "Security model" };

export default function SecurityModel() {
  return (
    <DocPage
      title="Security model"
      lead="What Yola holds, what it never asks for, and what a compromise would expose."
    >
      <Callout tone="warn" title="Pre-release software">
        Deploying Yola in production requires an independent security review, threat modelling and testing against
        your own setup.
      </Callout>

      <h2>What Yola never holds</h2>
      <ul>
        <li>Your funds. Payments go straight to addresses derived from your own wallet’s keys.</li>
        <li>Seed phrases or spending keys. Yola has no field that accepts them.</li>
        <li>Customer wallet secrets of any kind.</li>
      </ul>

      <h2>What Yola does hold</h2>
      <table>
        <thead><tr><th>Item</th><th>Why</th><th>If leaked</th></tr></thead>
        <tbody>
          <tr>
            <td>Incoming viewing key</td>
            <td>Detect and attribute shielded payments</td>
            <td>Your incoming payment history becomes visible. Funds cannot be spent.</td>
          </tr>
          <tr>
            <td>API key hashes</td>
            <td>Authenticate your server</td>
            <td>Hashes cannot be used as keys.</td>
          </tr>
          <tr>
            <td>Webhook signing secrets</td>
            <td>Sign deliveries</td>
            <td>Webhooks could be forged. Rotate the secret.</td>
          </tr>
        </tbody>
      </table>
      <p>
        Viewing keys are encrypted at rest, held only by the scanner process, and never logged, returned by the API,
        or sent to a browser. Use a dedicated receiving account for Yola.
      </p>

      <h2>Trust rules built into the code</h2>
      <ul>
        <li>Statuses change only through an evidence-gated state machine. A browser cannot mark a payment paid.</li>
        <li>A payment is confirmed only if the network adapter genuinely supports amount, destination, confirmation and reorg checks.</li>
        <li>Simulated payments are fixed as simulated at creation and cannot be promoted.</li>
        <li>Amounts are exact integers (zatoshis). There is no floating-point money anywhere.</li>
        <li>The SDK refuses to run with a secret key in a browser.</li>
      </ul>

      <h2>Request handling</h2>
      <ul>
        <li>Input validation with strict schemas and request size limits.</li>
        <li>Per-key rate limits and idempotent creation.</li>
        <li>Errors carry a request ID and never echo secrets.</li>
        <li>Webhook destinations are restricted to public HTTPS addresses to prevent server-side request forgery.</li>
      </ul>
    </DocPage>
  );
}
