import { Callout, DocPage } from "@/components/docs/docs-ui";
import { CodeBlock } from "@/components/ui/code-block";
import { SNIPPET_QR } from "@/lib/content/snippets";

export const metadata = { title: "QR codes and ZIP 321" };

export default function QrGuide() {
  return (
    <DocPage
      title="QR codes and ZIP 321"
      lead="Yola builds payment links in the ZIP 321 format and encodes exactly that link in the QR code."
    >
      <h2>The payment URI</h2>
      <CodeBlock lang="bash" filename="ZIP 321, single payment" code={`zcash:<address>?amount=0.25&message=Order%201042`} />
      <ul>
        <li><code>amount</code> is decimal ZEC with at most 8 decimal places, up to 21,000,000.</li>
        <li><code>memo</code>, when used, is base64url without padding, at most 512 bytes, and only allowed for shielded-capable addresses.</li>
        <li><code>label</code> and <code>message</code> are percent-encoded. Nothing else may be.</li>
        <li>Sprout addresses are not allowed.</li>
      </ul>
      <p>
        Yola rejects a request whose address is for a different network than the request, before a URI is ever
        built.
      </p>

      <h2>Rendering the QR</h2>
      <CodeBlock code={SNIPPET_QR} filename="checkout/qr.ts" />

      <Callout title="Simulator payloads are deliberately not zcash: URIs">
        In demo mode <code>payment_uri</code> is <code>null</code> and <code>qr_payload</code> starts with{" "}
        <code>yola-demo:</code>. A wallet that scans it will not recognise it, which is the point.
      </Callout>

      <h2>Wallet compatibility</h2>
      <p>
        ZIP 321 is a published standard, but support for every parameter varies between wallets. Yola does not
        claim universal compatibility. Wallet-by-wallet test results will be listed here once testnet integration
        is complete.
      </p>
      <p>Never put customer names, emails or other personal data in the message or memo.</p>
    </DocPage>
  );
}
