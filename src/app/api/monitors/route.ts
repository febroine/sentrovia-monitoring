import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { hasPermission } from "@/lib/auth/permissions";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import { applyMonitorDefaults } from "@/lib/monitors/defaults";
import { monitorBulkDeleteSchema, monitorInputSchema } from "@/lib/monitors/schemas";
import { createMonitor, deleteMonitors, listMonitors, SOFT_DELETE_UNDO_MS } from "@/lib/monitors/service";
import { serializeMonitorRecord } from "@/lib/monitors/utils";
import { getSettings } from "@/lib/settings/service";
import { recordAuditEventSafely } from "@/lib/audit/service";

export const runtime = "nodejs";

function serializeMonitor(
  monitor: Awaited<ReturnType<typeof listMonitors>>[number],
  includeSecrets = true
) {
  return serializeMonitorRecord(monitor, includeSecrets);
}

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const monitors = await listMonitors(session.id, undefined, session.activeWorkspaceId!);

    return NextResponse.json({
      monitors: monitors.map((monitor) =>
        serializeMonitor(monitor, hasPermission(session.role, "monitors.manage"))
      ),
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

    const body = await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES);
    const settings = await getSettings(session.id);
    const parsed = monitorInputSchema.safeParse(applyMonitorDefaults(body, settings));

    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid monitor payload." }, { status: 400 });
    }

    const monitor = await createMonitor(session.id, parsed.data, session.activeWorkspaceId!);
    await recordAuditEventSafely({
      userId: session.id,
      actorUserId: session.id,
      actorLabel: session.email,
      entityType: "monitor",
      entityId: monitor.id,
      entityLabel: monitor.name,
      action: "monitor.created",
      summary: `${monitor.monitorType} monitor was created.`,
    });

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

    const body = await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES);
    const parsed = monitorBulkDeleteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ message: "Select at least one monitor to delete." }, { status: 400 });
    }

    const deleted = await deleteMonitors(session.id, parsed.data.ids, session.activeWorkspaceId!);
    await Promise.all(deleted.map((monitor) => recordAuditEventSafely({
      userId: session.id,
      actorUserId: session.id,
      actorLabel: session.email,
      entityType: "monitor",
      entityId: monitor.id,
      entityLabel: monitor.id,
      action: "monitor.deleted",
      summary: "Monitor was moved to recently deleted items.",
    })));
    const deletedAt = deleted[0]?.deletedAt;
    return NextResponse.json({
      ids: deleted.map((item) => item.id),
      undoUntil: deletedAt ? new Date(deletedAt.getTime() + SOFT_DELETE_UNDO_MS).toISOString() : null,
    });
  } catch (error) {
    const authError = toAuthError(error, "Unable to delete monitors right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
