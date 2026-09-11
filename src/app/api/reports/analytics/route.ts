import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { apiErrorResponse } from "@/lib/http/api-route";
import { reportAnalyticsQuerySchema } from "@/lib/reports/schemas";
import { generateReportPreview } from "@/lib/reports/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const searchParams = request.nextUrl.searchParams;
    const parsed = reportAnalyticsQuerySchema.safeParse({
      ...Object.fromEntries(searchParams.entries()),
      excludeMonitorIds: searchParams.getAll("excludeMonitorIds"),
      excludeTags: searchParams.getAll("excludeTags"),
      excludeCompanyIds: searchParams.getAll("excludeCompanyIds"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Invalid analytics query." },
        { status: 400 }
      );
    }

    const report = await generateReportPreview(
      session.id,
      {
        scope: "global",
        cadence: parsed.data.periodRange === "30d" ? "monthly" : "weekly",
        template: "operations",
        ...parsed.data,
      },
      new Date(),
      session.activeWorkspaceId ?? undefined
    );

    return NextResponse.json({ report });
  } catch (error) {
    return apiErrorResponse(error, "Unable to load report analytics right now.");
  }
}
