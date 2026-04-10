import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { clearLogs, getLogFilterOptions, listLogs } from "@/lib/logs/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const logs = await listLogs(session.id, {
      search: searchParams.get("search") ?? "",
      level: searchParams.get("level") ?? "all",
      companyQuery: searchParams.get("companyQuery") ?? "",
      monitorQuery: searchParams.get("monitorQuery") ?? "",
      from: searchParams.get("from") ?? "",
      to: searchParams.get("to") ?? "",
      statusCode: searchParams.get("statusCode") ?? "",
      page: Number(searchParams.get("page") ?? "1"),
      pageSize: Number(searchParams.get("pageSize") ?? "10"),
    });
    const options = await getLogFilterOptions(session.id);

    return NextResponse.json({
      logs: logs.rows.map((log) => ({ ...log, createdAt: log.createdAt.toISOString() })),
      filters: options,
      pagination: {
        total: logs.total,
        page: logs.page,
        pageSize: logs.pageSize,
      },
    });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load logs right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function DELETE() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const deleted = await clearLogs(session.id);
    return NextResponse.json({ count: deleted.length });
  } catch (error) {
    const authError = toAuthError(error, "Unable to clear logs right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
