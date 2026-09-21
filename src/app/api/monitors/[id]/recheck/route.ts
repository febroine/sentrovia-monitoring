import { NextResponse } from "next/server";
import { assertPermission } from "@/lib/auth/permissions";
import { toAuthError } from "@/lib/auth/errors";
import { getSession } from "@/lib/auth/session";
import { assertSameOriginMutation } from "@/lib/http/json-body";
import { queueMonitorRecheck } from "@/lib/monitors/service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOriginMutation(request);
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    assertPermission(session.role, "monitors.manage");

    const { id } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ message: "Invalid monitor id." }, { status: 400 });
    }
    const queued = await queueMonitorRecheck(session.id, id, session.activeWorkspaceId!);
    if (!queued) {
      return NextResponse.json({ message: "Monitor is unavailable, verifying a failure, already due, or currently being checked." }, { status: 409 });
    }
    return NextResponse.json({ queued: true });
  } catch (error) {
    const authError = toAuthError(error, "Unable to queue a monitor check right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
