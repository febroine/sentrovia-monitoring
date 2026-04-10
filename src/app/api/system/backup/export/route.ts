import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { buildWorkspaceBackupBundle, serializeWorkspaceBackup } from "@/lib/system/backup-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const format = request.nextUrl.searchParams.get("format") === "yaml" ? "yaml" : "json";
    const bundle = await buildWorkspaceBackupBundle(session.id);
    const body = serializeWorkspaceBackup(bundle, format);

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
