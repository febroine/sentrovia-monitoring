import { NextResponse } from "next/server";
import { toAuthError } from "@/lib/auth/errors";
import { getSession } from "@/lib/auth/session";
import { listMonitorAlertStates } from "@/lib/monitors/alert-states";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const monitors = await listMonitorAlertStates(session.activeWorkspaceId!);
    return NextResponse.json({ workspaceId: session.activeWorkspaceId, monitors });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load monitor states right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
