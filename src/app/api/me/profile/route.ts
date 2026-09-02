import { NextRequest, NextResponse } from "next/server";
import { recordAuditEventSafely } from "@/lib/audit/service";
import { requireSession } from "@/lib/auth/authorization";
import { createSessionToken } from "@/lib/auth/token";
import { applySessionCookie } from "@/lib/auth/session";
import { apiErrorResponse, parseJsonRequest, requireMutationSession } from "@/lib/http/api-route";
import { getUserProfile, updateUserProfile } from "@/lib/profile/service";
import { profileSettingsSchema } from "@/lib/settings/schemas";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireSession();
    const profile = await getUserProfile(session.id, session.activeWorkspaceId ?? undefined);
    if (!profile) {
      return NextResponse.json({ message: "Profile not found." }, { status: 404 });
    }

    return NextResponse.json(
      { profile },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return apiErrorResponse(error, "Unable to load your profile right now.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireMutationSession(request);
    const input = await parseJsonRequest(request, profileSettingsSchema, "Invalid profile payload.");
    const profile = await updateUserProfile(session.id, input, session.activeWorkspaceId ?? undefined);
    if (!profile) {
      return NextResponse.json({ message: "Profile not found." }, { status: 404 });
    }

await recordAuditEventSafely({
userId: session.id,
workspaceId: session.activeWorkspaceId!,
      actorUserId: session.id,
      actorLabel: profile.email,
      entityType: "profile",
      entityId: session.id,
      entityLabel: profile.email,
      action: "profile.updated",
      summary: "Personal profile details were updated.",
    });

    const response = NextResponse.json({ profile });
    const token = await createSessionToken(
      {
        id: session.id,
        activeWorkspaceId: session.activeWorkspaceId!,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        department: profile.department || null,
        role: session.role,
      },
      session.sessionVersion
    );

    return applySessionCookie(response, token);
  } catch (error) {
    return apiErrorResponse(error, "Unable to save your profile right now.");
  }
}
