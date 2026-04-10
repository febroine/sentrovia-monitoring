import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { listRecentMonitorChecks } from "@/lib/monitors/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const history = await listRecentMonitorChecks(session.id, 5);

    return NextResponse.json({
      history: Object.fromEntries(
        Object.entries(history).map(([monitorId, points]) => [
          monitorId,
          points.map((point) => ({
            id: point.id,
            monitorId: point.monitorId,
            status: point.status,
            statusCode: point.statusCode,
            latencyMs: point.latencyMs,
            createdAt: point.createdAt.toISOString(),
          })),
        ])
      ),
    });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load monitor history right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
