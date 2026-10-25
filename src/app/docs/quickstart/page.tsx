import Link from "next/link";
import { Callout, DocPage } from "@/components/docs/docs-ui";
import { CodeBlock } from "@/components/ui/code-block";

export const metadata = { title: "Quickstart" };

export default function Quickstart() {
  return (
    <DocPage
      title="Quickstart"
      lead="Run Yola on your machine and take a simulated payment from request to confirmation. No wallet, node or API key needed."
    >
      <h2>1. Install and run</h2>
      <p>You need Node.js 20 or newer and pnpm.</p>
      <CodeBlock
        lang="bash"
        filename="Terminal"
        code={`git clone <your-yola-repo-url> yola
cd yola
pnpm install
pnpm dev`}
      />
      <p>
        Open <code>http://localhost:3000</code>.
      </p>

      <h2>2. Create a simulated payment</h2>
      <ol>
        <li>Go to the <Link href="/#demo">live demo</Link> on the home page.</li>
        <li>Keep the environment on <strong>Simulator</strong>, enter an amount, and choose <strong>Create payment request</strong>.</li>
        <li>Use the simulator controls to send the payment, mine blocks, or try an underpayment, a reorg or an expiry.</li>
      </ol>
      <p>
        Every step runs the same amount parser and state machine the API will use. The panel is labelled{" "}
        <code>SIMULATED — NO BLOCKCHAIN TRANSACTION</code> throughout.
      </p>

      <h2>3. Run the tests</h2>
      <CodeBlock lang="bash" filename="Terminal" code={`pnpm test        # unit tests
pnpm typecheck   # strict TypeScript
pnpm lint`} />

      <h2>4. Use the SDK from your server</h2>
      <p>
        The SDK lives in <code>src/sdk</code> and is importable as <code>@yola/sdk</code> inside this repository.
      </p>
      <CodeBlock
        filename="server/checkout.ts"
        code={`import { YolaClient } from "@yola/sdk";

const yola = new YolaClient({ apiKey: process.env.YOLA_SECRET_KEY! });

const payment = await yola.paymentRequests.create(
  { amount: "0.25", currency: "ZEC", network: "demo", description: "Order 1042" },
  { idempotencyKey: "order-1042" },
);`}
      />
      <Callout tone="warn" title="The HTTP API is the next build stage">
        The SDK client is implemented and tested, but the <code>/api/v1</code> route handlers it calls arrive in
        stage 3. Until then, use the simulator on the home page.
      </Callout>
    </DocPage>
  );
}
