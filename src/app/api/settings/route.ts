import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { assertPermission, hasPermission } from "@/lib/auth/permissions";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import { settingsSchema } from "@/lib/settings/schemas";
import { getSettings, upsertSettings } from "@/lib/settings/service";
import { recordAuditEventSafely } from "@/lib/audit/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const settings = await getSettings(
      session.id,
      hasPermission(session.role, "settings.manage")
    );
    return NextResponse.json({ settings });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load settings right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    assertPermission(session.role, "settings.manage");

    const body = await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES);
    const parsed = settingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid settings payload." }, { status: 400 });
    }

    const settings = await upsertSettings(session.id, parsed.data);
    await recordAuditEventSafely({
      userId: session.id,
      actorUserId: session.id,
      actorLabel: session.email,
      entityType: "settings",
      entityId: session.id,
      entityLabel: "Workspace settings",
      action: "settings.updated",
      summary: "Workspace settings were updated.",
    });
    return NextResponse.json({ settings });
  } catch (error) {
    const authError = toAuthError(error, "Unable to save settings right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
