import type { ApiCall } from "./router";
import type { Gateway, GatewayResponse } from "./local-gateway";

/**
 * Gateway for the dashboard playground: sends calls to this server, where
 * the user's session (not an API key) authorises them for one project.
 */
export function createServerGateway(projectId: string): Gateway {
  return {
    kind: "server",
    label: "This project",
    async call(req: ApiCall): Promise<GatewayResponse> {
      const started = performance.now();
      const res = await fetch(`/api/dashboard/projects/${encodeURIComponent(projectId)}/playground`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: req.method, path: req.path, body: req.body, idempotencyKey: req.idempotencyKey ?? null }),
        cache: "no-store",
      });
      const durationMs = Math.round(performance.now() - started);
      if (!res.ok) {
        return { status: res.status, headers: {}, body: { error: { code: "transport_error", message: `The dashboard request failed (HTTP ${res.status}).` } }, durationMs };
      }
      const data = (await res.json()) as { status: number; headers: Record<string, string>; body: unknown };
      return { ...data, durationMs };
    },
  };
}
