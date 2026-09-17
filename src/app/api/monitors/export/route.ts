import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { assertPermission } from "@/lib/auth/permissions";
import {
  buildMonitorExportRows,
  getMonitorExportContentType,
  serializeMonitorExport,
} from "@/lib/monitors/export";
import { listMonitors, listMonitorsPage } from "@/lib/monitors/service";

export const runtime = "nodejs";

const monitorExportQuerySchema = z.object({
  format: z.enum(["xlsx", "csv", "json"]).default("xlsx"),
  scope: z.enum(["all", "selected", "filtered"]).default("all"),
  ids: z.array(z.string().uuid()).max(500),
  search: z.string().trim().max(200).optional(),
  companyId: z.string().uuid().optional(),
  status: z.enum(["up", "down", "pending"]).optional(),
  sort: z.enum(["createdAt", "name", "status", "lastCheckedAt", "latencyMs"]).default("createdAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
}).superRefine((value, context) => {
  if (value.scope === "selected" && value.ids.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["ids"],
      message: "Select at least one monitor to export.",
    });
  }
});

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    assertPermission(session.role, "monitors.manage");

    const parsed = monitorExportQuerySchema.safeParse({
      format: request.nextUrl.searchParams.get("format") ?? undefined,
      scope: request.nextUrl.searchParams.get("scope") ?? undefined,
      ids: request.nextUrl.searchParams.getAll("id"),
      search: request.nextUrl.searchParams.get("search") ?? undefined,
      companyId: request.nextUrl.searchParams.get("companyId") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      sort: request.nextUrl.searchParams.get("sort") ?? undefined,
      direction: request.nextUrl.searchParams.get("direction") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Invalid monitor export request." },
        { status: 400 }
      );
    }

    const monitors = parsed.data.scope === "filtered"
      ? await listFilteredMonitors(session.id, session.activeWorkspaceId!, parsed.data)
      : await listMonitors(session.id, undefined, session.activeWorkspaceId!);
    const selectedIds = parsed.data.scope === "selected" ? new Set(parsed.data.ids) : undefined;
    const rows = buildMonitorExportRows(monitors, selectedIds);
    if (rows.length === 0) {
      return NextResponse.json({ message: "No monitors are available for this export." }, { status: 404 });
    }

    const body = await serializeMonitorExport(rows, parsed.data.format);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `sentrovia-monitors-${parsed.data.scope}-${date}.${parsed.data.format}`;

    return new NextResponse(Uint8Array.from(body), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Type": getMonitorExportContentType(parsed.data.format),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const authError = toAuthError(error, "Unable to export monitors right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

async function listFilteredMonitors(
  userId: string,
  workspaceId: string,
  filters: z.infer<typeof monitorExportQuerySchema>
) {
  const pageSize = 500;
  const query = {
    pageSize,
    search: filters.search,
    companyId: filters.companyId,
    status: filters.status,
    sort: filters.sort,
    direction: filters.direction,
  };
  const first = await listMonitorsPage(userId, { ...query, page: 1 }, undefined, workspaceId);
  const monitors = [...first.monitors];
  for (let page = 2; page <= first.pagination.totalPages; page++) {
    const result = await listMonitorsPage(userId, { ...query, page }, undefined, workspaceId);
    monitors.push(...result.monitors);
  }
  return monitors;
}
