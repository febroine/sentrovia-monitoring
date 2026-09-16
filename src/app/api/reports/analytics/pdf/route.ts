import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { apiErrorResponse, parseJsonRequest } from "@/lib/http/api-route";
import { REPORT_ANALYTICS_LIMITS } from "@/lib/reports/limits";
import { reportAnalyticsQuerySchema } from "@/lib/reports/schemas";
import { generateReportPreview } from "@/lib/reports/service";
import { renderReportPdf } from "@/lib/reports/render-pdf";
import { buildReportFileSlug } from "@/lib/reports/export";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const input = await parseJsonRequest(
      request,
      reportAnalyticsQuerySchema,
      "Invalid analytics request.",
      REPORT_ANALYTICS_LIMITS.maxRequestBytes
    );
    const report = await generateReportPreview(session.id, {
      scope: input.companyId ? "company" : "global",
      cadence: input.periodRange === "30d" ? "monthly" : "weekly",
      template: "operations",
      ...input,
    }, new Date(), session.activeWorkspaceId ?? undefined);
    const pdf = await renderReportPdf(report);
    const filename = `${buildReportFileSlug(report)}.pdf`;
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Report-Filename": filename,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "Unable to generate the PDF report right now.");
  }
}
