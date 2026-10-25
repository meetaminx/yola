import { Callout, DocPage } from "@/components/docs/docs-ui";
import { CodeBlock } from "@/components/ui/code-block";
import { SNIPPET_CREATE } from "@/lib/content/snippets";

export const metadata = { title: "TypeScript SDK" };

export default function SdkGuide() {
  return (
    <DocPage
      title="TypeScript SDK"
      lead="A small, fully typed server-side client. It validates amounts before sending, supports idempotency and timeouts, and never logs your key."
    >
      <h2>Create a client</h2>
      <CodeBlock code={SNIPPET_CREATE} filename="server/checkout.ts" />

      <h2>Methods</h2>
      <table>
        <thead><tr><th>Method</th><th>Returns</th></tr></thead>
        <tbody>
          <tr><td><code>paymentRequests.create(params, {"{ idempotencyKey }"})</code></td><td><code>PaymentRequest</code></td></tr>
          <tr><td><code>paymentRequests.retrieve(id)</code></td><td><code>PaymentRequest</code></td></tr>
          <tr><td><code>paymentRequests.status(id)</code></td><td><code>PaymentStatusResponse</code></td></tr>
          <tr><td><code>paymentRequests.cancel(id)</code></td><td><code>PaymentRequest</code></td></tr>
          <tr><td><code>paymentRequests.list({"{ status, limit, starting_after }"})</code></td><td><code>{"{ data, has_more }"}</code></td></tr>
          <tr><td><code>verifyWebhookSignature(options)</code></td><td><code>VerifyResult</code></td></tr>
        </tbody>
      </table>

      <h2>Errors</h2>
      <p>
        Every failure throws a <code>YolaApiError</code> with <code>status</code>, <code>code</code>,{" "}
        <code>requestId</code> and, for validation errors, <code>fields</code>. Network failures use status{" "}
        <code>0</code> with code <code>network_error</code> or <code>timeout</code>.
      </p>
      <CodeBlock
        code={`import { YolaApiError } from "@yola/sdk";

try {
  await yola.paymentRequests.create({ amount: "0.123456789", currency: "ZEC", network: "demo" });
} catch (err) {
  if (err instanceof YolaApiError && err.code === "amount_precision") {
    // show err.fields?.amount next to the amount field
  }
}`}
      />

      <Callout tone="warn" title="Secret keys stay on the server">
        Constructing <code>YolaClient</code> with a secret key (<code>ysk_…</code>) in a browser throws immediately.
        Have the browser call your own endpoint, which calls Yola.
      </Callout>
    </DocPage>
  );
}
