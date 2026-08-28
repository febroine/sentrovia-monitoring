import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, requireMutationSession } from "@/lib/http/api-route";
import { duplicateReportSchedule } from "@/lib/reports/service";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function POST(request: NextRequest, context: { params: Params }) {
  try {
    const session = await requireMutationSession(request);

    const { id } = await context.params;
    const schedule = await duplicateReportSchedule(session.id, id);
    if (!schedule) {
      return NextResponse.json({ message: "Report schedule not found." }, { status: 404 });
    }

    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Unable to duplicate the report schedule right now.");
  }
}
