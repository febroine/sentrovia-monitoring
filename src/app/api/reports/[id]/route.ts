import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, parseJsonRequest, requireMutationSession } from "@/lib/http/api-route";
import { reportSchedulePatchSchema } from "@/lib/reports/schemas";
import { deleteReportSchedule, updateReportSchedule } from "@/lib/reports/service";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function PATCH(request: NextRequest, context: { params: Params }) {
  try {
    const session = await requireMutationSession(request);
    const input = await parseJsonRequest(request, reportSchedulePatchSchema, "Invalid report schedule update.");

    const { id } = await context.params;
    const schedule = await updateReportSchedule(
      session.id,
      id,
      input,
      session.activeWorkspaceId ?? undefined
    );
    if (!schedule) {
      return NextResponse.json({ message: "Report schedule not found." }, { status: 404 });
    }

    return NextResponse.json({ schedule });
  } catch (error) {
    return apiErrorResponse(error, "Unable to update the report schedule right now.");
  }
}

export async function DELETE(request: NextRequest, context: { params: Params }) {
  try {
    const session = await requireMutationSession(request);

    const { id } = await context.params;
    const deleted = await deleteReportSchedule(
      session.id,
      id,
      session.activeWorkspaceId ?? undefined
    );
    if (!deleted) {
      return NextResponse.json({ message: "Report schedule not found." }, { status: 404 });
    }

    return NextResponse.json({ id: deleted.id });
  } catch (error) {
    return apiErrorResponse(error, "Unable to delete the report schedule right now.");
  }
}
