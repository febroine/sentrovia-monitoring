import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireAdminSession } from "@/lib/auth/authorization";
import { toAuthError } from "@/lib/auth/errors";
import {
  parseWorkspaceBackup,
  previewWorkspaceBackupRestore,
  restoreWorkspaceBackup,
} from "@/lib/system/backup-service";
import {
  createWorkspaceRestoreToken,
  getWorkspaceRestoreRevision,
  verifyWorkspaceRestoreToken,
} from "@/lib/system/restore-approval";
import { WORKSPACE_BACKUP_IMPORT_LIMITS } from "@/lib/import-limits";
import { readJsonBody } from "@/lib/http/json-body";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminSession();

    const body = (await readJsonBody(request, WORKSPACE_BACKUP_IMPORT_LIMITS.maxRequestBytes)) as {
      format?: string;
      content?: string;
      mode?: string;
      confirm?: boolean;
      restoreToken?: string;
    };
    const format = body.format === "yaml" ? "yaml" : "json";
    const mode = body.mode ?? "restore";
    if (mode !== "preview" && mode !== "restore") {
      return NextResponse.json({ message: "Invalid backup restore mode." }, { status: 400 });
    }
    const content = body.content?.trim();

    if (!content) {
      return NextResponse.json({ message: "Paste a JSON or YAML backup bundle first." }, { status: 400 });
    }

    const bundle = parseWorkspaceBackup(content, format);
    if (mode === "preview") {
      const { preview, workspaceRevision } = await previewWorkspaceBackupRestore(session.id, bundle);
      return NextResponse.json({
        preview,
        restoreToken: createWorkspaceRestoreToken(session.id, format, content, workspaceRevision),
      });
    }
    if (body.confirm !== true || !body.restoreToken) {
      return NextResponse.json({ message: "Analyze the backup and confirm the restore first." }, { status: 400 });
    }
    const workspaceRevision = await getWorkspaceRestoreRevision(session.id);
    if (!verifyWorkspaceRestoreToken(body.restoreToken, session.id, format, content, workspaceRevision)) {
      return NextResponse.json({ message: "Workspace data changed or the restore analysis expired. Analyze the backup again." }, { status: 400 });
    }
    const restored = await restoreWorkspaceBackup(session.id, bundle, {
      expectedRevision: workspaceRevision,
    });
    return NextResponse.json({ restored });
  } catch (error) {
    if (isBackupPayloadError(error)) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : "The backup file is invalid." },
        { status: 400 }
      );
    }

    const authError = toAuthError(error, "Unable to restore the workspace backup right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

function isBackupPayloadError(error: unknown) {
  if (error instanceof ZodError) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return [
    "backup file",
    "uploaded backup",
    "Duplicate company name",
    "Monitor references a missing company",
    "Duplicate monitor target",
    "PostgreSQL monitor passwords are not included",
    "SMTP password is not included",
    "Restore at most",
  ].some((message) => error.message.includes(message));
}
