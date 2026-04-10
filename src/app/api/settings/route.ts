import { NextRequest, NextResponse } from "next/server";
import { createSessionToken } from "@/lib/auth/token";
import { applySessionCookie, getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { settingsSchema } from "@/lib/settings/schemas";
import { getSettings, upsertSettings } from "@/lib/settings/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const settings = await getSettings(session.id);
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

    const body = await request.json();
    const parsed = settingsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid settings payload." }, { status: 400 });
    }

    const settings = await upsertSettings(session.id, parsed.data);
    const response = NextResponse.json({ settings });

    return applySessionCookie(
      response,
      await createSessionToken({
        id: session.id,
        firstName: parsed.data.profile.firstName,
        lastName: parsed.data.profile.lastName,
        email: parsed.data.profile.email,
        department: parsed.data.profile.department || null,
      })
    );
  } catch (error) {
    const authError = toAuthError(error, "Unable to save settings right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
