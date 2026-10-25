import Link from "next/link";
import { Callout, DocPage } from "@/components/docs/docs-ui";

export const metadata = { title: "Documentation" };

export default function DocsIntro() {
  return (
    <DocPage
      title="Introduction"
      lead="Yola is developer infrastructure for accepting ZEC: payment requests, QR codes, status tracking and signed webhooks, without holding your funds."
    >
      <p>
        You create a payment request on your server. Yola gives you a QR code and a{" "}
        <Link href="/docs/qr">ZIP 321 payment link</Link> for your customer, watches the Zcash network for the
        payment, and tells your application when it is confirmed.
      </p>

      <h2>What works today</h2>
      <table>
        <thead>
          <tr>
            <th>Part</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Simulator (demo mode)</td><td>Working. Try it on the <Link href="/#demo">home page</Link>.</td></tr>
          <tr><td>Exact amount handling, state machine</td><td>Working and tested.</td></tr>
          <tr><td>ZIP 321 URI builder, address prefix checks</td><td>Working and tested against the ZIP 321 examples.</td></tr>
          <tr><td>TypeScript SDK client, webhook signatures</td><td>Working and tested.</td></tr>
          <tr><td>HTTP API (<code>/api/v1</code>), dashboard, database</td><td>In progress (build stage 3).</td></tr>
          <tr><td>Testnet verification</td><td>Designed, not yet connected (build stage 4).</td></tr>
          <tr><td>Mainnet</td><td>Disabled until verification has been tested and reviewed.</td></tr>
        </tbody>
      </table>

      <Callout title="Three environments, never mixed">
        <strong>Simulator</strong> events are generated locally and prove nothing.{" "}
        <strong>Testnet</strong> uses real transactions with test funds (TAZ) that have no monetary value.{" "}
        <strong>Mainnet</strong> uses real ZEC. A payment’s environment is fixed when it is created and can
        never change.
      </Callout>

      <h2>Where to go next</h2>
      <ul>
        <li><Link href="/docs/quickstart">Quickstart</Link>: run Yola locally and create a simulated payment.</li>
        <li><Link href="/docs/architecture">Architecture and verification</Link>: how Yola proves a shielded payment arrived.</li>
        <li><Link href="/docs/security">Security model</Link>: what Yola stores, and what it never asks for.</li>
      </ul>
    </DocPage>
  );
}
