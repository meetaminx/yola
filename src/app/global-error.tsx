"use client";

/**
 * Last-resort error UI when the root layout itself fails. It renders its own
 * document without the app's stylesheet, so styles are inline.
 */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#08090D", color: "#F8FAFC", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" }}>
        <title>Something went wrong | Yola</title>
        <main style={{ maxWidth: "52ch", margin: "0 auto", padding: "20vh 20px" }}>
          <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, letterSpacing: "0.12em", color: "#9AA3B2", textTransform: "uppercase" }}>Error</p>
          <h1 style={{ fontSize: 32, lineHeight: 1.15, margin: "12px 0 0" }}>Yola could not load this page.</h1>
          <p style={{ color: "#9AA3B2", lineHeight: 1.6 }}>Try again in a moment. No payment status was changed by this error.</p>
          <button
            onClick={() => retry()}
            style={{ marginTop: 24, height: 40, padding: "0 16px", borderRadius: 10, border: 0, background: "#8B5CF6", color: "#fff", fontSize: 14, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
