import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { parseWorkspaceBackup, restoreWorkspaceBackup } from "@/lib/system/backup-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { format?: string; content?: string };
    const format = body.format === "yaml" ? "yaml" : "json";
    const content = body.content?.trim();

    if (!content) {
      return NextResponse.json({ message: "Paste a JSON or YAML backup bundle first." }, { status: 400 });
    }

    const bundle = parseWorkspaceBackup(content, format);
    const restored = await restoreWorkspaceBackup(session.id, bundle);
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
  ].some((message) => error.message.includes(message));
}
