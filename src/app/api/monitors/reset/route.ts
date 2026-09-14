import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, parseJsonRequest, requireMutationPermission } from "@/lib/http/api-route";
import { monitorBulkDeleteSchema } from "@/lib/monitors/schemas";
import { resetMonitorHistory } from "@/lib/monitors/service";
import { serializeMonitorRecord } from "@/lib/monitors/utils";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireMutationPermission(request, "monitors.manage");
    const input = await parseJsonRequest(
      request,
      monitorBulkDeleteSchema,
      "Select at least one monitor to reset."
    );
    const resetMonitors = await resetMonitorHistory(
      session.id,
      input.ids,
      session.activeWorkspaceId!
    );
    if (resetMonitors.length === 0) {
      return NextResponse.json({ message: "No matching monitors were found." }, { status: 404 });
    }
    return NextResponse.json({
      monitors: resetMonitors.map((monitor) => serializeMonitorRecord(monitor)),
    });
  } catch (error) {
    return apiErrorResponse(error, "Unable to reset monitor history right now.");
  }
}
