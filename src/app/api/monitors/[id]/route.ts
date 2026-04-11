import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { applyMonitorDefaults } from "@/lib/monitors/defaults";
import { monitorInputSchema } from "@/lib/monitors/schemas";
import { deleteMonitors, updateMonitor } from "@/lib/monitors/service";
import { serializeMonitorRecord } from "@/lib/monitors/utils";
import { getSettings } from "@/lib/settings/service";

export const runtime = "nodejs";

type MonitorRouteContext = {
  params: Promise<{ id: string }>;
};

function serializeMonitor(monitor: Awaited<ReturnType<typeof updateMonitor>>) {
  if (!monitor) {
    return null;
  }

  return serializeMonitorRecord(monitor);
}

export async function PATCH(request: NextRequest, context: MonitorRouteContext) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const settings = await getSettings(session.id);
    const parsed = monitorInputSchema.safeParse(applyMonitorDefaults(body, settings));

    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid monitor payload." }, { status: 400 });
    }

    const monitor = await updateMonitor(session.id, id, parsed.data);

    if (!monitor) {
      return NextResponse.json({ message: "Monitor not found." }, { status: 404 });
    }

    return NextResponse.json({ monitor: serializeMonitor(monitor) });
  } catch (error) {
    const authError = toAuthError(error, "Unable to update monitor right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function DELETE(_request: NextRequest, context: MonitorRouteContext) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const deleted = await deleteMonitors(session.id, [id]);

    if (deleted.length === 0) {
      return NextResponse.json({ message: "Monitor not found." }, { status: 404 });
    }

    return NextResponse.json({ id });
  } catch (error) {
    const authError = toAuthError(error, "Unable to delete monitor right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
