import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, parseJsonRequest, requireMutationSession } from "@/lib/http/api-route";
import { reportPreviewSchema } from "@/lib/reports/schemas";
import { generateReportPreview } from "@/lib/reports/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireMutationSession(request);
    const input = await parseJsonRequest(request, reportPreviewSchema, "Invalid report preview payload.");
    const report = await generateReportPreview(session.id, input);
    return NextResponse.json({ report });
  } catch (error) {
    return apiErrorResponse(error, "Unable to generate the report preview right now.");
  }
}
