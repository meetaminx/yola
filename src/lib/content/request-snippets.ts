/**
 * Generates copyable code for a playground request in several languages.
 * Every snippet calls the real v1 API with the documented headers.
 */

export type SnippetLanguage = "curl" | "typescript" | "javascript" | "python";

export const SNIPPET_LANGUAGES: { id: SnippetLanguage; label: string }[] = [
  { id: "typescript", label: "TypeScript SDK" },
  { id: "curl", label: "cURL" },
  { id: "javascript", label: "fetch" },
  { id: "python", label: "Python" },
];

export type Operation = "create" | "retrieve" | "status" | "list" | "cancel" | "simulate";

export interface SnippetRequest {
  operation: Operation;
  method: "GET" | "POST";
  path: string; // under /api/v1
  body?: unknown;
  idempotencyKey?: string;
  baseUrl: string;
}

function pyLiteral(value: unknown, indent = 0): string {
  const pad = "    ".repeat(indent + 1);
  const end = "    ".repeat(indent);
  if (value === null) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => pyLiteral(v, indent)).join(", ")}]`;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return "{}";
  return `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${pyLiteral(v, indent + 1)},`).join("\n")}\n${end}}`;
}

function tsLiteral(value: unknown, indent = 1): string {
  const json = JSON.stringify(value, null, 2) ?? "undefined";
  return json
    .split("\n")
    .map((line, i) => (i === 0 ? line : "  ".repeat(indent - 1) + line))
    .join("\n")
    .replace(/"([A-Za-z_$][\w$]*)":/g, "$1:");
}

function idFromPath(path: string): string {
  return decodeURIComponent(path.split("/")[2] ?? "");
}

export function generateSnippet(lang: SnippetLanguage, req: SnippetRequest): string {
  const url = `${req.baseUrl.replace(/\/+$/, "")}/api/v1${req.path}`;
  const hasBody = req.method === "POST" && req.body !== undefined;

  switch (lang) {
    case "curl": {
      const lines = [`curl -X ${req.method} '${url}' \\`, `  -H "Authorization: Bearer $YOLA_SECRET_KEY"`];
      if (req.idempotencyKey) {
        lines[lines.length - 1] += " \\";
        lines.push(`  -H "Idempotency-Key: ${req.idempotencyKey}"`);
      }
      if (hasBody) {
        lines[lines.length - 1] += " \\";
        lines.push(`  -H "Content-Type: application/json" \\`);
        lines.push(`  -d '${JSON.stringify(req.body).replace(/'/g, "'\\''")}'`);
      }
      return lines.join("\n");
    }

    case "javascript": {
      const headers: string[] = [`    Authorization: \`Bearer \${process.env.YOLA_SECRET_KEY}\`,`];
      if (req.idempotencyKey) headers.push(`    "Idempotency-Key": ${JSON.stringify(req.idempotencyKey)},`);
      if (hasBody) headers.push(`    "Content-Type": "application/json",`);
      return [
        `// Server-side only: never send your secret key to a browser.`,
        `const res = await fetch(${JSON.stringify(url)}, {`,
        `  method: "${req.method}",`,
        `  headers: {`,
        ...headers,
        `  },`,
        ...(hasBody ? [`  body: JSON.stringify(${tsLiteral(req.body, 2)}),`] : []),
        `});`,
        `const data = await res.json();`,
        `if (!res.ok) throw new Error(\`\${data.error.code}: \${data.error.message} (\${data.error.request_id})\`);`,
      ].join("\n");
    }

    case "python": {
      const headers = [`    "Authorization": f"Bearer {os.environ['YOLA_SECRET_KEY']}",`];
      if (req.idempotencyKey) headers.push(`    "Idempotency-Key": ${JSON.stringify(req.idempotencyKey)},`);
      return [
        `import os`,
        `import requests`,
        ``,
        `res = requests.${req.method.toLowerCase()}(`,
        `    ${JSON.stringify(url)},`,
        `    headers={`,
        ...headers.map((h) => `    ${h}`),
        `    },`,
        ...(hasBody ? [`    json=${pyLiteral(req.body, 1)},`] : []),
        `    timeout=15,`,
        `)`,
        `data = res.json()`,
        `if not res.ok:`,
        `    raise RuntimeError(f"{data['error']['code']}: {data['error']['message']}")`,
      ].join("\n");
    }

    case "typescript": {
      const head = [
        `import { YolaClient } from "@yola/sdk";`,
        ``,
        `const yola = new YolaClient({`,
        `  apiKey: process.env.YOLA_SECRET_KEY!,`,
        `  baseUrl: ${JSON.stringify(req.baseUrl)},`,
        `});`,
        ``,
      ];
      const id = JSON.stringify(idFromPath(req.path));
      let call: string;
      switch (req.operation) {
        case "create":
          call = `const payment = await yola.paymentRequests.create(${tsLiteral(req.body)}${
            req.idempotencyKey ? `, { idempotencyKey: ${JSON.stringify(req.idempotencyKey)} }` : ""
          });`;
          break;
        case "retrieve":
          call = `const payment = await yola.paymentRequests.retrieve(${id});`;
          break;
        case "status":
          call = `const status = await yola.paymentRequests.status(${id});`;
          break;
        case "cancel":
          call = `const payment = await yola.paymentRequests.cancel(${id});`;
          break;
        case "simulate": {
          const action = (req.body as { action?: string } | undefined)?.action ?? "pay";
          call = `// Demo network only\nconst payment = await yola.paymentRequests.simulate(${id}, ${JSON.stringify(action)});`;
          break;
        }
        case "list": {
          const q = new URL(req.path, "http://x").searchParams;
          const params: Record<string, string | number> = {};
          for (const [k, v] of q) params[k] = k === "limit" ? Number(v) : v;
          call = `const page = await yola.paymentRequests.list(${Object.keys(params).length ? tsLiteral(params) : ""});`;
          break;
        }
      }
      return [...head, call].join("\n");
    }
  }
}
