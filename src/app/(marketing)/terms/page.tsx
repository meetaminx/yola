import Link from "next/link";
import { Contact, LegalPage } from "@/components/legal/legal-page";
import { operator } from "@/lib/site";

export const metadata = { title: "Terms of service" };

export default function TermsPage() {
  const o = operator();
  return (
    <LegalPage title="Terms of service">
      <p>
        These terms apply to your use of this Yola service, run by {o.name} (&ldquo;we&rdquo;). By creating an account or
        using the API, you agree to them. If you use Yola for an organisation, you agree on its behalf.
      </p>

      <h2>What Yola is</h2>
      <p>
        Yola is developer tooling for accepting Zcash (ZEC): payment requests, QR codes, status tracking, webhooks and a
        dashboard. It is <strong>pre-release software</strong>. In this release:
      </p>
      <ul>
        <li>
          The <strong>demo</strong> network is a simulator. Simulated payments involve no blockchain and no money.
        </li>
        <li>
          The <strong>testnet</strong> network uses Zcash test funds, which have no monetary value, and is available only
          where the operator has enabled it.
        </li>
        <li>
          <strong>Mainnet is disabled.</strong> Do not use Yola to accept real ZEC until mainnet support is released.
        </li>
      </ul>

      <h2>No custody</h2>
      <p>
        Yola never holds, transmits or controls funds. Payments go from the payer&apos;s wallet directly to yours. We cannot
        reverse, refund, recover or redirect any transaction. Never give Yola, or anyone, your seed phrase or spending keys.
      </p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>Keep your password and API keys secret, and revoke any key you think has leaked.</li>
        <li>Check a payment&apos;s status through the API or a verified webhook before you fulfil an order.</li>
        <li>Follow the laws that apply to you and your customers, including tax, consumer and sanctions rules.</li>
        <li>Keep customers&apos; personal data out of descriptions and metadata.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Do not use Yola to:</p>
      <ul>
        <li>break the law, defraud anyone, or process payments for illegal goods or services;</li>
        <li>attack, probe, overload or bypass the security or rate limits of the service or any other system;</li>
        <li>send webhooks to systems you do not control or have no permission to use;</li>
        <li>misrepresent simulated or test payments as real ones.</li>
      </ul>
      <p>We may suspend or close accounts that break these rules.</p>

      <h2>Availability and changes</h2>
      <p>
        We aim to keep the service running but do not promise any level of availability while it is pre-release. We may
        change or remove features, and will give reasonable notice of changes that break the API where we can.
      </p>

      <h2>Disclaimer</h2>
      <p>
        The service is provided &ldquo;as is&rdquo;, without warranties of any kind, to the extent the law allows. Payment
        status depends on blockchain data and third-party infrastructure, and can be delayed or affected by network events
        such as reorganisations. See <Link href="/docs/testnet">how verification works</Link>.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the extent the law allows, we are not liable for indirect or consequential losses, lost profits, or losses
        caused by blockchain events, your wallet, third-party services, or your failure to verify a payment. Nothing in
        these terms limits liability that cannot be limited by law.
      </p>

      <h2>Ending your use</h2>
      <p>
        You can stop using Yola at any time and ask us to delete your account at <Contact />. We may end access with notice,
        or without notice for serious breaches of these terms.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        If these terms change, the date at the top changes too. Continuing to use the service after a change means you
        accept the new terms. See also the <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>Contact</h2>
      <p>
        <Contact />
      </p>
    </LegalPage>
  );
}
