import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, parseJsonRequest, requireMutationPermission } from "@/lib/http/api-route";
import { reportPreviewSchema } from "@/lib/reports/schemas";
import { generateReportPreview } from "@/lib/reports/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireMutationPermission(request, "reports.manage");
    const input = await parseJsonRequest(request, reportPreviewSchema, "Invalid report preview payload.");
    const report = await generateReportPreview(
      session.id,
      input,
      new Date(),
      session.activeWorkspaceId ?? undefined
    );
    return NextResponse.json({ report });
  } catch (error) {
    return apiErrorResponse(error, "Unable to generate the report preview right now.");
  }
}
