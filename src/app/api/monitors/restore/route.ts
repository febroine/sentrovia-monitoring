import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, parseJsonRequest, requireMutationPermission } from "@/lib/http/api-route";
import { monitorBulkDeleteSchema } from "@/lib/monitors/schemas";
import { restoreMonitors } from "@/lib/monitors/service";
import { serializeMonitorRecord } from "@/lib/monitors/utils";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireMutationPermission(request, "monitors.manage");
    const input = await parseJsonRequest(
      request,
      monitorBulkDeleteSchema,
      "Select at least one monitor to restore."
    );
    const restored = await restoreMonitors(
      session.id,
      input.ids,
      new Date(),
      session.activeWorkspaceId!
    );
    if (restored.length === 0) {
      return NextResponse.json({ message: "The monitor restore window has expired." }, { status: 409 });
    }
    return NextResponse.json({
      monitors: restored.map((monitor) => serializeMonitorRecord(monitor)),
    });
  } catch (error) {
    return apiErrorResponse(error, "Unable to restore monitors right now.");
  }
}
