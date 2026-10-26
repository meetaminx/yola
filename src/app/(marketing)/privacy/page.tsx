import Link from "next/link";
import { Contact, LegalPage } from "@/components/legal/legal-page";
import { operator } from "@/lib/site";

export const metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  const o = operator();
  return (
    <LegalPage title="Privacy policy">
      <p>
        This policy explains what this Yola service, run by {o.name}, stores about you and why. Yola helps developers
        accept Zcash payments. It does not hold anyone&apos;s funds and does not sell or share personal data for
        advertising.
      </p>

      <h2>What we store</h2>
      <h3>If you create an account</h3>
      <ul>
        <li>Your name and email address, and a salted hash of your password (never the password itself).</li>
        <li>
          If you sign in with GitHub: the name, email address and profile picture GitHub shares with us, and the access
          tokens needed to keep you signed in.
        </li>
        <li>Session records: a session token, its expiry, and the IP address and browser user agent it was created from.</li>
        <li>Your projects, team memberships and settings.</li>
      </ul>
      <h3>When you use the API or dashboard</h3>
      <ul>
        <li>
          API keys, stored only as a hash plus the last four characters, with when they were created, last used and revoked.
        </li>
        <li>
          Payment requests you create: amount, network, status history, and any description, external reference or
          metadata you send. Do not put your customers&apos; personal data in those fields.
        </li>
        <li>
          Webhook endpoints (URL and an encrypted signing secret) and delivery logs: the event sent, the response status,
          a short excerpt of the response, and timing.
        </li>
        <li>An audit log of account and project actions (who did what, and when), without secrets or keys.</li>
        <li>
          Short-lived rate-limit counters keyed by IP address, API key or a hash of the email used to sign in. They are
          deleted automatically.
        </li>
        <li>Server logs with request IDs, paths, status codes and timings. Keys and secrets are removed before logging.</li>
      </ul>
      <h3>Zcash testnet, where enabled</h3>
      <ul>
        <li>
          A unified incoming viewing key you choose to add, encrypted at rest. It lets Yola see payments to your addresses
          but cannot spend funds. Yola never asks for, accepts or stores seed phrases or spending keys.
        </li>
        <li>For payments to your requests: transaction IDs, amounts, block heights and when they were seen.</li>
      </ul>
      <h3>Paying customers</h3>
      <p>
        Yola does not ask the people who pay a payment request for any personal information. A payment page shows the
        amount, address and status. Anything else is up to the merchant who created the request.
      </p>

      <h2>What we do not do</h2>
      <ul>
        <li>No analytics, advertising or tracking scripts, and no third-party cookies.</li>
        <li>No custody of funds. Payments go directly from the payer&apos;s wallet to the merchant&apos;s wallet.</li>
        <li>No sale or rental of personal data.</li>
      </ul>

      <h2>Cookies and browser storage</h2>
      <ul>
        <li>A session cookie that keeps you signed in, and a cookie that remembers your selected project.</li>
        <li>
          The sample store and playground keep their state in your browser&apos;s session storage. It never leaves your
          browser and is cleared when you close the tab.
        </li>
      </ul>

      <h2>Why we use it</h2>
      <p>
        To provide the service you asked for (your account, the API and webhooks), to keep it secure (sign-in protection,
        rate limits, audit logs) and to meet legal obligations. We do not use your data for anything else.
      </p>

      <h2>Who processes it</h2>
      <p>
        The service runs on infrastructure providers that process data on our behalf: the hosting provider (Vercel) and
        the database provider (Neon). If you sign in with GitHub, GitHub handles that sign-in. Webhook events go only to
        URLs you configure.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Account, project, payment and audit records: while your account exists.</li>
        <li>Idempotency records: 24 hours. Rate-limit counters: minutes.</li>
        <li>Server logs: as retained by the hosting provider.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask for a copy of your data, a correction, or deletion of your account and its data by writing to{" "}
        <Contact />. Depending on where you live, you may have further rights under laws such as the GDPR or the Nigeria
        Data Protection Act, including the right to complain to your data protection authority.
      </p>

      <h2>Security</h2>
      <p>
        Passwords are hashed, API keys are stored as hashes, and webhook secrets and viewing keys are encrypted. Traffic is
        served over HTTPS. See the <Link href="/docs/security">security model</Link> for details.
      </p>

      <h2>Changes</h2>
      <p>If this policy changes, the date at the top changes too. Significant changes will be announced to account holders by email.</p>

      <h2>Contact</h2>
      <p>
        Questions about privacy: <Contact />.
      </p>
    </LegalPage>
  );
}
