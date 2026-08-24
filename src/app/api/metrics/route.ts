import { getMetricsAuthToken } from "@/lib/env";
import {
  collectPrometheusSnapshot,
  isMetricsRequestAuthorized,
  renderPrometheusMetrics,
} from "@/lib/metrics/prometheus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!getMetricsAuthToken()) {
    return new Response("Not found\n", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (!isMetricsRequestAuthorized(request.headers.get("authorization"))) {
    return new Response("Unauthorized\n", {
      status: 401,
      headers: { "Cache-Control": "no-store", "WWW-Authenticate": "Bearer" },
    });
  }

  const snapshot = await collectPrometheusSnapshot();
  return new Response(renderPrometheusMetrics(snapshot), {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
