import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { applyMonitorDefaults } from "@/lib/monitors/defaults";
import { monitorBulkDeleteSchema, monitorInputSchema } from "@/lib/monitors/schemas";
import { createMonitor, deleteMonitors, listMonitors } from "@/lib/monitors/service";
import { serializeMonitorRecord } from "@/lib/monitors/utils";
import { getSettings } from "@/lib/settings/service";

export const runtime = "nodejs";

function serializeMonitor(monitor: Awaited<ReturnType<typeof listMonitors>>[number]) {
  return serializeMonitorRecord(monitor);
}

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const monitors = await listMonitors(session.id);

    return NextResponse.json({
      monitors: monitors.map(serializeMonitor),
    });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load monitors right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const settings = await getSettings(session.id);
    const parsed = monitorInputSchema.safeParse(applyMonitorDefaults(body, settings));

    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid monitor payload." }, { status: 400 });
    }

    const monitor = await createMonitor(session.id, parsed.data);

    return NextResponse.json({ monitor: serializeMonitor(monitor) }, { status: 201 });
  } catch (error) {
    const authError = toAuthError(error, "Unable to create monitor right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = monitorBulkDeleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ message: "Select at least one monitor to delete." }, { status: 400 });
    }

    const deleted = await deleteMonitors(session.id, parsed.data.ids);
    return NextResponse.json({ ids: deleted.map((item) => item.id) });
  } catch (error) {
    const authError = toAuthError(error, "Unable to delete monitors right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
