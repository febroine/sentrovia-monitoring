import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { assertPermission } from "@/lib/auth/permissions";
import { toAuthError } from "@/lib/auth/errors";
import { assertSameOriginMutation } from "@/lib/http/json-body";
import { undoLatestMonitorImport } from "@/lib/monitors/import-history";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOriginMutation(request);
    const session = await getSession();
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    assertPermission(session.role, "monitors.manage");
    const { id } = await context.params;
    const result = await undoLatestMonitorImport(session.id, session.activeWorkspaceId!, id);
    return NextResponse.json(result);
  } catch (error) {
    const authError = toAuthError(error, "Unable to undo this import.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
