import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { assertWorkspaceOwner } from "@/lib/auth/authorization";
import { applyAvailableUpdate, getUpdateStatus } from "@/lib/app-update/service";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await assertWorkspaceOwner(session.id);
    const status = await getUpdateStatus(session.id);
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load the update status right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await assertWorkspaceOwner(session.id);
    const result = await applyAvailableUpdate(session.id);
    return NextResponse.json(result);
  } catch (error) {
    const authError = toAuthError(error, "Unable to apply the update automatically.");
    return NextResponse.json(
      {
        updated: false,
        restartRequired: false,
        message: authError.message,
      },
      { status: authError.status }
    );
  }
}
