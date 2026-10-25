import { connection } from "next/server";
import { healthReport } from "@/lib/server/health";
import { jsonResponse } from "@/lib/server/http";

/**
 * Public health check. Reports safe operational status only: no versions
 * of dependencies, hostnames, credentials or counts.
 */
export async function GET() {
  await connection();
  const report = await healthReport();
  return jsonResponse(report.status === "unavailable" ? 503 : 200, report);
}
