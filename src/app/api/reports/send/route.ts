import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, parseJsonRequest, requireMutationPermission } from "@/lib/http/api-route";
import { reportDispatchSchema } from "@/lib/reports/schemas";
import { dispatchReportNow } from "@/lib/reports/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireMutationPermission(request, "reports.manage");
    const input = await parseJsonRequest(request, reportDispatchSchema, "Invalid report delivery payload.");
    const result = await dispatchReportNow(
      session.id,
      input,
      input.recipientEmails,
      session.activeWorkspaceId ?? undefined
    );
    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error, "Unable to send the report right now.");
  }
}
