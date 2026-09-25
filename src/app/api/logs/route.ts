import { NextRequest, NextResponse } from "next/server";
import { requireWorkspacePermission } from "@/lib/auth/authorization";
import { toAuthError } from "@/lib/auth/errors";
import { clearLogs, countClearableLogs, getLogFilterOptions, listLogs } from "@/lib/logs/service";
import { assertSameOriginMutation } from "@/lib/http/json-body";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireWorkspacePermission("audit.read");

    const { searchParams } = new URL(request.url);
    const filters = {
      search: searchParams.get("search") ?? "",
      level: searchParams.get("level") ?? "all",
      companyQuery: searchParams.get("companyQuery") ?? "",
      monitorQuery: searchParams.get("monitorQuery") ?? "",
      from: searchParams.get("from") ?? "",
      to: searchParams.get("to") ?? "",
      statusCode: searchParams.get("statusCode") ?? "",
      timezoneOffsetMinutes: Number(searchParams.get("timezoneOffsetMinutes") ?? "0"),
      fromTimezoneOffsetMinutes: Number(
        searchParams.get("fromTimezoneOffsetMinutes")
          ?? searchParams.get("timezoneOffsetMinutes")
          ?? "0"
      ),
      toExclusiveTimezoneOffsetMinutes: Number(
        searchParams.get("toExclusiveTimezoneOffsetMinutes")
          ?? searchParams.get("timezoneOffsetMinutes")
          ?? "0"
      ),
      page: Number(searchParams.get("page") ?? "1"),
      pageSize: Number(searchParams.get("pageSize") ?? "10"),
    };
    const [logs, options, clearableTotal] = await Promise.all([
      listLogs(session.id, filters, session.activeWorkspaceId!),
      getLogFilterOptions(session.id, session.activeWorkspaceId!),
      countClearableLogs(session.id, session.activeWorkspaceId!),
    ]);

    return NextResponse.json({
      logs: logs.rows.map((log) => ({ ...log, createdAt: log.createdAt.toISOString() })),
      filters: options,
      pagination: {
        total: logs.total,
        clearableTotal,
        page: logs.page,
        pageSize: logs.pageSize,
      },
    });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load logs right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const session = await requireWorkspacePermission("audit.read");

    const deleted = await clearLogs(session.id, session.activeWorkspaceId!);
    return NextResponse.json({ count: deleted.length });
  } catch (error) {
    const authError = toAuthError(error, "Unable to clear logs right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
