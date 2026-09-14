import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { apiErrorResponse, parseJsonRequest } from "@/lib/http/api-route";
import { REPORT_ANALYTICS_LIMITS } from "@/lib/reports/limits";
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
      monitorIds: searchParams.getAll("monitorIds"),
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

    return generateAnalyticsResponse(session, parsed.data);
  } catch (error) {
    return apiErrorResponse(error, "Unable to load report analytics right now.");
  }
}

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
    return generateAnalyticsResponse(session, input);
  } catch (error) {
    return apiErrorResponse(error, "Unable to load report analytics right now.");
  }
}

async function generateAnalyticsResponse(
  session: { id: string; activeWorkspaceId?: string | null },
  input: z.infer<typeof reportAnalyticsQuerySchema>
) {
  const report = await generateReportPreview(
    session.id,
    {
      scope: input.companyId ? "company" : "global",
      cadence: input.periodRange === "30d" ? "monthly" : "weekly",
      template: "operations",
      ...input,
    },
    new Date(),
    session.activeWorkspaceId ?? undefined
  );

  return NextResponse.json(
    { report },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
