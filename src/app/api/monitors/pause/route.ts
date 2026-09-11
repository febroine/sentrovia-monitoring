import { NextRequest, NextResponse } from "next/server";
import { toAuthError } from "@/lib/auth/errors";
import { assertPermission } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/session";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import { resolveMonitorPauseUntil } from "@/lib/monitors/pause";
import { monitorPauseSchema } from "@/lib/monitors/schemas";
import { updateMonitorPause } from "@/lib/monitors/service";
import { serializeMonitorRecord } from "@/lib/monitors/utils";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    assertPermission(session.role, "monitors.manage");

    const body = await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES);
    const parsed = monitorPauseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Invalid monitor pause request." },
        { status: 400 }
      );
    }

    const pausedUntil = parsed.data.action === "pause"
      ? resolveMonitorPauseUntil(parsed.data.durationValue, parsed.data.durationUnit)
      : null;
    const updatedMonitors = await updateMonitorPause(
      session.id,
      parsed.data.ids,
      pausedUntil,
      session.activeWorkspaceId!
    );

    return NextResponse.json({
      monitors: updatedMonitors.map((monitor) => serializeMonitorRecord(monitor)),
      pausedUntil: pausedUntil?.toISOString() ?? null,
    });
  } catch (error) {
    const authError = toAuthError(error, "Unable to update monitor pause state right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
