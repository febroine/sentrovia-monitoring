import { NextResponse } from "next/server";
import { applyAuthResponseHeaders } from "@/lib/auth/response";
import { clearSessionCookie, getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { invalidateUserSessions } from "@/lib/auth/service";
import { assertSameOriginMutation } from "@/lib/http/json-body";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const session = await getSession();
    if (session) {
      await invalidateUserSessions(session.id);
    }
    const response = applyAuthResponseHeaders(
      NextResponse.json({ message: "Signed out successfully." })
    );
    return clearSessionCookie(response);
  } catch (error) {
    const authError = toAuthError(error, "Unable to sign out right now.");
    return clearSessionCookie(
      applyAuthResponseHeaders(
        NextResponse.json({ message: authError.message }, { status: authError.status })
      )
    );
  }
}
