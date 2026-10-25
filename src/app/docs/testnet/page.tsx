import Link from "next/link";
import { Callout, DocPage, Status } from "@/components/docs/docs-ui";
import { CodeBlock } from "@/components/ui/code-block";

export const metadata = { title: "Testnet" };

export default function TestnetGuide() {
  return (
    <DocPage
      title="Testnet"
      lead="Testnet mode uses real Zcash testnet transactions with test funds (TAZ). It only turns on when the infrastructure below is configured and reachable."
    >
      <Status>Not connected yet. The adapter interface exists; the backend arrives in build stage 4.</Status>

      <Callout tone="warn" title="ZCASH TESTNET — TEST FUNDS HAVE NO MONETARY VALUE">
        TAZ cannot be exchanged for ZEC. Never send mainnet ZEC to a testnet address.
      </Callout>

      <h2>What testnet mode needs</h2>
      <table>
        <thead><tr><th>Component</th><th>Role</th></tr></thead>
        <tbody>
          <tr><td><strong>Zebra</strong> (<code>zebrad</code>)</td><td>The supported Zcash full node, synced to testnet.</td></tr>
          <tr><td><strong>Zaino</strong></td><td>Indexer that serves blocks and mempool data to the scanner.</td></tr>
          <tr><td><strong>Yola scanner</strong></td><td>Holds your incoming viewing key and trial-decrypts shielded outputs.</td></tr>
          <tr><td>A testnet wallet</td><td>To export a viewing key and to pay test requests.</td></tr>
        </tbody>
      </table>
      <p>
        <code>zcashd</code> is not supported. It reached end of life in July 2026. See{" "}
        <Link href="/docs/architecture">Architecture</Link> for why each part is needed.
      </p>

      <h2>Configuration</h2>
      <CodeBlock
        lang="bash"
        filename=".env.local"
        code={`YOLA_TESTNET_ENABLED=true
ZCASH_BACKEND_URL=https://your-zaino-host:8137
ZCASH_BACKEND_AUTH_TOKEN=…   # server-side only`}
      />
      <p>
        On start-up Yola checks that the backend is reachable and on testnet. If the check fails, testnet stays off
        and the playground explains what is missing. You can always continue with the simulator.
      </p>

      <h2>What Yola will not do</h2>
      <ul>
        <li>Hard-code a public node or faucet without checking it is current and appropriate.</li>
        <li>Mark a testnet payment confirmed without observing it through the configured backend.</li>
        <li>Turn a simulated payment into a testnet payment.</li>
      </ul>
    </DocPage>
  );
}
