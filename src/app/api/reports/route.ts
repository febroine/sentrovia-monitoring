import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/authorization";
import { apiErrorResponse, parseJsonRequest, requireMutationPermission } from "@/lib/http/api-route";
import { reportScheduleSchema } from "@/lib/reports/schemas";
import { createReportSchedule, listReportSchedules } from "@/lib/reports/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireSession();

    const schedules = await listReportSchedules(session.id, session.activeWorkspaceId ?? undefined);
    return NextResponse.json({ schedules });
  } catch (error) {
    return apiErrorResponse(error, "Unable to load reports right now.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireMutationPermission(request, "reports.manage");
    const input = await parseJsonRequest(request, reportScheduleSchema, "Invalid report schedule payload.");
    const schedule = await createReportSchedule(
      session.id,
      input,
      session.activeWorkspaceId ?? undefined
    );
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Unable to create the report schedule right now.");
  }
}
