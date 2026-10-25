import { Eye, FileKey2, KeyRound, Layers, ScrollText, ServerCog } from "lucide-react";

const PRINCIPLES = [
  {
    icon: KeyRound,
    title: "Your funds go to your addresses",
    body: "Payments land in the merchant’s own wallet. Yola never holds funds and never asks for a seed phrase or spending key.",
  },
  {
    icon: ServerCog,
    title: "Verification happens on the server",
    body: "A status only changes when the backend observes the payment. A browser callback can never mark an order as paid.",
  },
  {
    icon: FileKey2,
    title: "Secret keys are shown once",
    body: "API secrets are hashed at rest and displayed only when created. The SDK refuses to run with a secret key in a browser.",
  },
  {
    icon: ScrollText,
    title: "Signed webhooks",
    body: "Every delivery carries an HMAC-SHA256 signature and a timestamp, so you can reject forgeries and replays.",
  },
  {
    icon: Layers,
    title: "Simulator and real networks stay apart",
    body: "Simulated payments are labelled everywhere and can never be promoted to testnet or mainnet payments.",
  },
  {
    icon: Eye,
    title: "Logs without payment details",
    body: "Audit logs record what happened and when, not viewing keys, memos or customer data.",
  },
];

const VISIBILITY = [
  { field: "Amount", transparent: "Public", shielded: "Encrypted" },
  { field: "Recipient address", transparent: "Public", shielded: "Encrypted" },
  { field: "Memo", transparent: "Not supported", shielded: "Encrypted" },
  { field: "How Yola verifies", transparent: "Reads the public output", shielded: "Decrypts with your incoming viewing key" },
];

export function PrivacySection() {
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div>
        <h2 className="type-heading text-[clamp(2rem,4vw,3rem)]">
          Private by default.
          <br />
          Honest about the limits.
        </h2>
        <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-muted">
          What an observer can see depends on the address type, how the customer’s wallet builds the transaction,
          and how a payment is verified. Yola is designed to keep as little as possible, but no system can
          promise perfect privacy.
        </p>

        <div className="mt-8 overflow-hidden rounded-[14px] border border-line">
          <table className="w-full text-left text-[13px]">
            <caption className="sr-only">What is visible on chain for each payment type</caption>
            <thead className="bg-surface text-muted">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-normal">On chain</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Transparent</th>
                <th scope="col" className="px-4 py-2.5 font-normal">Shielded</th>
              </tr>
            </thead>
            <tbody>
              {VISIBILITY.map((r) => (
                <tr key={r.field} className="border-t border-line">
                  <th scope="row" className="px-4 py-2.5 font-normal text-text">{r.field}</th>
                  <td className="px-4 py-2.5 text-muted">{r.transparent}</td>
                  <td className="px-4 py-2.5 text-brand-soft">{r.shielded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] text-faint">
          A unified address can contain a transparent receiver. The sender’s wallet decides which one it pays.
        </p>
      </div>

      <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
        {PRINCIPLES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="border-t border-line pt-5">
            <Icon className="size-5 text-brand-soft" aria-hidden />
            <h3 className="mt-3 text-[15px] font-medium text-text">{title}</h3>
            <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
