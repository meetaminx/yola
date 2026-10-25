import "server-only";

/**
 * Structured JSON logs, one line per event. Fields whose names look like
 * credentials are replaced before writing, at any depth, so a mistake in a
 * caller cannot leak a secret into log storage.
 */

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE = /(authorization|cookie|secret|password|token|api[_-]?key|viewing|uivk|ufvk|seed|signature|memo)/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    // Identifiers (api_key_id, endpoint_id) are not secrets and stay readable.
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) && !/_id$/i.test(k) ? "[redacted]" : redact(v, depth + 1);
    return out;
  }
  if (typeof value === "string") {
    // Catch credentials that appear inside free text.
    return value.replace(/ysk_(test|live)_[0-9a-z]+/g, "ysk_$1_[redacted]").replace(/\bwhsec_[0-9a-z]+/g, "whsec_[redacted]");
  }
  if (typeof value === "bigint") return value.toString();
  return value;
}

function threshold(): number {
  const l = (process.env.LOG_LEVEL ?? "info") as Level;
  return ORDER[l] ?? ORDER.info;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < threshold()) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...(redact(fields ?? {}) as object) });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => write("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};

export function errorFields(err: unknown) {
  return err instanceof Error ? { error: err.name, error_message: err.message } : { error: String(err) };
}
