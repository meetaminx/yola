import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { CopyButton } from "./copy-button";

/**
 * Small, dependency-free highlighter for the TypeScript/JSON/shell snippets
 * Yola shows. It colours comments, strings, keywords, numbers, function
 * calls and properties; anything else is plain text.
 */
const KEYWORDS = new Set([
  "import", "from", "export", "const", "let", "await", "async", "function", "return", "new", "if", "else",
  "throw", "try", "catch", "type", "interface", "true", "false", "null", "undefined", "default", "process",
]);

const TOKEN =
  /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(\d[\d_.]*)\b|([A-Za-z_$][\w$]*)(?=\s*\()|(?<=\.)([A-Za-z_$][\w$]*)|\b([A-Za-z_$][\w$]*)\b|(<\/?[A-Z][\w.]*)/g;

function highlight(code: string, lang: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of code.matchAll(TOKEN)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(code.slice(last, idx));
    const [text, comment, str, num, call, prop, word, jsx] = m;
    let cls: string | undefined;
    if (comment !== undefined) cls = lang === "ts" && text.startsWith("#") ? undefined : "text-faint italic";
    else if (str !== undefined) cls = "text-signal/90";
    else if (num !== undefined) cls = "text-[#f0abfc]";
    else if (call !== undefined) cls = KEYWORDS.has(call) ? "text-brand-soft" : "text-[#93c5fd]";
    else if (prop !== undefined) cls = "text-text/85";
    else if (jsx !== undefined) cls = "text-[#93c5fd]";
    else if (word !== undefined && KEYWORDS.has(word)) cls = "text-brand-soft";
    out.push(cls ? <span key={i++} className={cls}>{text}</span> : <Fragment key={i++}>{text}</Fragment>);
    last = idx + text.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

interface CodeBlockProps {
  code: string;
  lang?: "ts" | "tsx" | "json" | "bash" | "http";
  filename?: string;
  className?: string;
  /** Hide the header bar (when embedded in a tabbed frame that has its own). */
  bare?: boolean;
}

export function CodeBlock({ code, lang = "ts", filename, className, bare }: CodeBlockProps) {
  return (
    <div className={cn("overflow-hidden rounded-[14px] border border-line bg-[#0b0c11]", className)}>
      {!bare && (
        <div className="flex h-10 items-center justify-between border-b border-line pl-4 pr-2">
          <span className="font-mono text-xs text-muted">{filename ?? lang}</span>
          <CopyButton value={code} label={filename ? `${filename} code` : "code"} />
        </div>
      )}
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-[1.7] text-text/90">
        <code>{highlight(code, lang)}</code>
      </pre>
    </div>
  );
}
