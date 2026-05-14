import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import {
  listRecentIncidentEvents,
  listRecentMonitorChecks,
  listRecentMonitorDiagnostics,
} from "@/lib/monitors/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const [history, diagnostics, incidentEvents] = await Promise.all([
      listRecentMonitorChecks(session.id, 5),
      listRecentMonitorDiagnostics(session.id, 3),
      listRecentIncidentEvents(session.id, 8),
    ]);

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
      diagnostics: Object.fromEntries(
        Object.entries(diagnostics).map(([monitorId, rows]) => [
          monitorId,
          rows.map((row) => ({
            id: row.id,
            monitorId: row.monitorId,
            status: row.status,
            failedPhase: row.failedPhase,
            failureCategory: row.failureCategory,
            summary: row.summary,
            dnsStatus: row.dnsStatus,
            resolvedIps: row.resolvedIps,
            tcpStatus: row.tcpStatus,
            tlsStatus: row.tlsStatus,
            httpStatus: row.httpStatus,
            httpStatusCode: row.httpStatusCode,
            responseTimeMs: row.responseTimeMs,
            timeoutMs: row.timeoutMs,
            errorMessage: row.errorMessage,
            createdAt: row.createdAt.toISOString(),
          })),
        ])
      ),
      incidentEvents: Object.fromEntries(
        Object.entries(incidentEvents).map(([monitorId, rows]) => [
          monitorId,
          rows.map((row) => ({
            id: row.id,
            incidentId: row.incidentId,
            monitorId: row.monitorId,
            eventType: row.eventType,
            title: row.title,
            detail: row.detail,
            metadata: parseMetadata(row.metadataJson),
            createdAt: row.createdAt.toISOString(),
          })),
        ])
      ),
    });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load monitor history right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

function parseMetadata(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}
