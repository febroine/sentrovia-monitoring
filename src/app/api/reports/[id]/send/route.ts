import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, requireMutationPermission } from "@/lib/http/api-route";
import { sendReportScheduleNow } from "@/lib/reports/service";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function POST(request: NextRequest, context: { params: Params }) {
  try {
    const session = await requireMutationPermission(request, "reports.manage");

    const { id } = await context.params;
    const result = await sendReportScheduleNow(
      session.id,
      id,
      new Date(),
      session.activeWorkspaceId ?? undefined
    );
    if (!result) {
      return NextResponse.json({ message: "Report schedule not found." }, { status: 404 });
    }

    if (!result.report) {
      return NextResponse.json(result, { status: 502 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error, "Unable to send the scheduled report right now.");
  }
}
