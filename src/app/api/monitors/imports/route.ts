import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/permissions";
import { toAuthError } from "@/lib/auth/errors";
import { listMonitorImportRuns } from "@/lib/monitors/import-history";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    assertPermission(session.role, "monitors.manage");
    return NextResponse.json({ runs: await listMonitorImportRuns(session.activeWorkspaceId!) });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load import history.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
