import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/authorization";
import { toAuthError } from "@/lib/auth/errors";
import {
  buildWorkspaceBackupBundle,
  recordWorkspaceBackupExport,
  serializeWorkspaceBackup,
} from "@/lib/system/backup-service";
import { recordAuditEventSafely } from "@/lib/audit/service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAdminSession();

    const format = request.nextUrl.searchParams.get("format") === "yaml" ? "yaml" : "json";
    const bundle = await buildWorkspaceBackupBundle(
      session.id,
      session.activeWorkspaceId ?? undefined
    );
    const body = serializeWorkspaceBackup(bundle, format);
    await recordAuditEventSafely({
      userId: session.id,
      workspaceId: session.activeWorkspaceId,
      actorUserId: session.id,
      actorLabel: session.email,
      entityType: "backup",
      entityLabel: "Workspace backup",
      action: "backup.exported",
      summary: `Downloaded a ${format.toUpperCase()} workspace backup.`,
    });
    try {
      await recordWorkspaceBackupExport(session.id, bundle.exportedAt);
    } catch (error) {
      console.warn(
        `[sentrovia] Workspace backup timestamp could not be recorded: ${error instanceof Error ? error.message : "unknown error"}`
      );
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": format === "yaml" ? "application/yaml" : "application/json",
        "Content-Disposition": `attachment; filename="sentrovia-workspace-backup.${format}"`,
      },
    });
  } catch (error) {
    const authError = toAuthError(error, "Unable to export the workspace backup right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
