import Link from "next/link";
import { Callout, DocPage, Status } from "@/components/docs/docs-ui";
import { CodeBlock } from "@/components/ui/code-block";

export const metadata = { title: "Testnet" };

export default function TestnetGuide() {
  return (
    <DocPage
      title="Testnet"
      lead="Testnet requests are paid with real Zcash testnet transactions using test funds (TAZ). Yola watches the chain with your incoming viewing key and confirms a payment only after it has seen it, at the depth your project requires."
    >
      <Status>
        Built and tested with real Zcash cryptography (Sapling, Orchard and Ironwood note encryption). Off by default:
        a server operator has to run the Yola scanner and enable it.
      </Status>

      <Callout tone="warn" title="ZCASH TESTNET — TEST FUNDS HAVE NO MONETARY VALUE">
        TAZ cannot be exchanged for ZEC. Never send mainnet ZEC to a testnet address.
      </Callout>

      <h2>How it works</h2>
      <ol>
        <li>
          You export a <strong>unified viewing key</strong> from your testnet wallet and add it under Dashboard, Settings.
          Yola keeps only its incoming part (the UIVK), encrypted. It can see payments to you; it cannot spend them.
        </li>
        <li>
          Each testnet request gets its <strong>own shielded address</strong>, derived from your key at a fresh
          diversifier index. The customer pays that address with any Zcash wallet, and the funds land in your wallet.
          Yola never holds them.
        </li>
        <li>
          The scanner reads compact blocks and the mempool from a lightwalletd or Zaino server and trial-decrypts every
          shielded output with your key. A match reveals the amount and which request&apos;s address was paid.
        </li>
        <li>
          Yola records the observation and moves the request through{" "}
          <code>payment_detected</code>, <code>confirming</code> and <code>confirmed</code> as blocks arrive. Your
          webhooks fire at each step.
        </li>
      </ol>

      <h2>What counts as a payment</h2>
      <table>
        <thead><tr><th>Situation</th><th>Result</th></tr></thead>
        <tbody>
          <tr><td>Seen in the mempool</td><td><code>payment_detected</code> (never confirmed from the mempool)</td></tr>
          <tr><td>Mined, fewer blocks than your policy</td><td><code>confirming</code>, with <code>confirmations.observed</code></td></tr>
          <tr><td>Full amount at the required depth</td><td><code>confirmed</code></td></tr>
          <tr><td>More than requested, at depth</td><td><code>overpaid</code>: decide whether to refund the excess</td></tr>
          <tr><td>Less than requested</td><td><code>underpaid</code>; a further payment to the same address tops it up</td></tr>
          <tr><td>Block orphaned before confirmation</td><td>Status steps back and follows the chain again</td></tr>
          <tr><td>Block orphaned after confirmation</td><td><code>verification_required</code>: review before relying on it</td></tr>
          <tr><td>Arrives after the deadline or a cancel</td><td><code>verification_required</code>, never confirmed automatically</td></tr>
          <tr><td>Paid to your ordinary wallet address</td><td>Ignored: only per-request addresses count</td></tr>
        </tbody>
      </table>
      <p>
        Required depth is set per project (Settings, default 10 blocks, about 12 minutes on testnet). A testnet request
        expires only after a complete scan that started after its deadline found nothing, so a slow or stopped scanner
        can delay expiry but never expires a request that was paid in time.
      </p>
      <p>
        Per-request addresses carry Sapling and Orchard receivers and no transparent receiver, so wallets pay them
        shielded. Orchard-receiver payments are detected in both the Orchard and the Ironwood (NU6.3) pools.
      </p>

      <h2>Running it</h2>
      <table>
        <thead><tr><th>Component</th><th>Role</th></tr></thead>
        <tbody>
          <tr><td><strong>Zebra</strong> (<code>zebrad</code>)</td><td>Full node synced to testnet.</td></tr>
          <tr><td><strong>Zaino</strong> or <strong>lightwalletd</strong></td><td>Serves compact blocks and the mempool over the lightwallet gRPC API.</td></tr>
          <tr><td><strong>Yola scanner</strong> (<code>scanner/</code>)</td><td>Rust service built on the official Zcash crates. Derives addresses and trial-decrypts. Stateless; keeps no keys.</td></tr>
          <tr><td>A testnet wallet</td><td>To export a viewing key and to pay test requests.</td></tr>
        </tbody>
      </table>
      <p>
        <code>zcashd</code> is not supported; it reached end of life in July 2026. See{" "}
        <Link href="/docs/architecture">Architecture</Link> for how the parts fit.
      </p>
      <CodeBlock
        lang="bash"
        filename="scanner"
        code={`cd scanner && cargo build --release
YOLA_SCANNER_LIGHTWALLETD_URL=https://your-zaino-or-lightwalletd:443 \\
YOLA_SCANNER_TOKEN=$(openssl rand -hex 32) \\
YOLA_SCANNER_LISTEN=127.0.0.1:9077 \\
./target/release/yola-scanner`}
      />
      <CodeBlock
        lang="bash"
        filename=".env (Yola server)"
        code={`YOLA_TESTNET_ENABLED=true
ZCASH_BACKEND_URL=http://127.0.0.1:9077     # the scanner, not the node
ZCASH_BACKEND_AUTH_TOKEN=<same token as YOLA_SCANNER_TOKEN>`}
      />
      <p>
        The scanner refuses to start for mainnet and refuses to scan if its backend reports any chain other than
        testnet. Keep it on a private network: it accepts viewing keys in request bodies and authenticates only with
        the bearer token. <code>GET /api/v1/health</code> reports <code>testnet: &quot;available&quot;</code> once the
        scanner and its backend answer.
      </p>

      <h2>What Yola will not do</h2>
      <ul>
        <li>Ask for or accept a seed phrase or spending key. The key form and the scanner reject them.</li>
        <li>Mark a testnet payment confirmed without observing it on chain at the required depth.</li>
        <li>Turn a simulated payment into a testnet payment, or simulate a testnet one.</li>
        <li>Enable mainnet. It stays off until the mainnet path has been built and independently reviewed.</li>
      </ul>
    </DocPage>
  );
}
