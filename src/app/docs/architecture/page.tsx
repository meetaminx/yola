import { Callout, DocPage } from "@/components/docs/docs-ui";
import { CodeBlock } from "@/components/ui/code-block";

export const metadata = { title: "Architecture and verification" };

export default function Architecture() {
  return (
    <DocPage
      title="Architecture and verification"
      lead="Creating a payment request is easy. Proving that a specific request was paid, when the payment is encrypted, is the real work. This is how Yola does it."
    >
      <h2>The approach</h2>
      <ol>
        <li>
          <strong>You share an incoming viewing key, not a spending key.</strong> It lets Yola see payments to your
          account and derive receiving addresses. It cannot spend.
        </li>
        <li>
          <strong>Every request gets its own address.</strong> Yola derives a fresh diversified shielded address for
          each request and records which request it belongs to.
        </li>
        <li>
          <strong>Yola decrypts what is yours.</strong> A scanner follows new blocks and the mempool through Zaino
          and Zebra, and trial-decrypts each shielded output with your key. A match reveals the amount and which
          address, and therefore which request, it paid.
        </li>
        <li>
          <strong>The state machine decides.</strong> Amount (exact, under, over), network and confirmation depth are
          checked against your policy. Reorgs move a payment back. Late payments go to review.
        </li>
      </ol>

      <Callout title="Why not match on memos?">
        Memos are optional and some wallets drop them. An address cannot be dropped. Yola may include your order
        reference in the message for the customer’s benefit, but attribution never depends on it.
      </Callout>

      <h2>Transparent and shielded payments</h2>
      <table>
        <thead><tr><th></th><th>Transparent</th><th>Shielded (Orchard, Sapling)</th></tr></thead>
        <tbody>
          <tr><td>Amount and recipient on chain</td><td>Public</td><td>Encrypted</td></tr>
          <tr><td>Detection</td><td>Read outputs to the address</td><td>Trial decryption with the viewing key</td></tr>
          <tr><td>Memo</td><td>Not possible</td><td>Up to 512 bytes, encrypted</td></tr>
          <tr><td>Privacy for merchant and customer</td><td>Low: revenue and payers are linkable</td><td>High: observers see neither</td></tr>
          <tr><td>Yola default</td><td>Off (opt-in later)</td><td>On</td></tr>
        </tbody>
      </table>
      <p>
        A unified address can carry both kinds of receiver; the payer’s wallet chooses. Yola’s per-request addresses
        contain shielded receivers only, so customers cannot accidentally pay transparently.
      </p>

      <h2>Layers</h2>
      <CodeBlock
        lang="bash"
        filename="Overview"
        code={`Developer API ─► PaymentRequestService ─► PaymentNetworkAdapter (demo | testnet | mainnet)
                         │                         │ declares VerificationCapabilities
                         ▼                         ▼
              PaymentVerificationService ◄── observations (scanner over Zebra + Zaino)
                         │
                         ▼
              Evidence-gated state machine ─► WebhookDeliveryService`}
      />

      <h2>The capability contract</h2>
      <p>
        Each adapter declares, per capability, whether it is <code>supported</code>, <code>unsupported</code>,{" "}
        <code>simulated</code> or <code>not_configured</code>. Yola refuses to confirm a payment unless amount
        verification, destination verification, confirmation tracking and reorg handling are all{" "}
        <code>supported</code>. The simulator reports <code>simulated</code> for everything, so it can drive the
        demo but can never confirm a real payment.
      </p>

      <h2>Infrastructure choices</h2>
      <ul>
        <li><strong>Zebra</strong> is the full node. <code>zcashd</code> reached end of life in July 2026 and is not supported.</li>
        <li><strong>Zaino</strong> is the indexer, replacing the indexing role of zcashd and lightwalletd.</li>
        <li>Trial decryption and address derivation will run in a small Rust service built on the official librustzcash crates. Yola does not reimplement Zcash cryptography in JavaScript.</li>
        <li><strong>Mainnet</strong> stays disabled until testnet verification has been tested and reviewed.</li>
      </ul>

      <h2>Open risks</h2>
      <ul>
        <li>Scanning cost grows with merchants and chain activity; batching and per-merchant start heights are needed at scale.</li>
        <li>Wallet support for ZIP 321 parameters varies and must be tested wallet by wallet.</li>
        <li>A leaked viewing key exposes incoming payment history. Ecosystem work on per-use viewing keys is being tracked.</li>
      </ul>
    </DocPage>
  );
}
