import { NextRequest, NextResponse } from "next/server";
import { toAuthError } from "@/lib/auth/errors";
import { getSession } from "@/lib/auth/session";
import { monitorActiveStateSchema } from "@/lib/monitors/schemas";
import { updateMonitorActiveState } from "@/lib/monitors/service";
import { serializeMonitorRecord } from "@/lib/monitors/utils";

export const runtime = "nodejs";

type MonitorActiveRouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: MonitorActiveRouteContext) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const parsed = monitorActiveStateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ message: "Invalid monitor active state." }, { status: 400 });
    }

    const monitor = await updateMonitorActiveState(session.id, id, parsed.data.isActive);

    if (!monitor) {
      return NextResponse.json({ message: "Monitor not found." }, { status: 404 });
    }

    return NextResponse.json({ monitor: serializeMonitorRecord(monitor) });
  } catch (error) {
    const authError = toAuthError(error, "Unable to update monitor active state right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
