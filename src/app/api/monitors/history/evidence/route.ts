import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { getMonitorCheckEvidence } from "@/lib/monitors/service";

export const runtime = "nodejs";

const checkIdSchema = z.string().trim().min(1).max(128);

// What a failed check saw, loaded only when its timeline point is opened.
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const parsedCheckId = checkIdSchema.safeParse(request.nextUrl.searchParams.get("checkId") ?? "");
    if (!parsedCheckId.success) {
      return NextResponse.json({ message: "Invalid check id." }, { status: 400 });
    }

    const evidence = session.activeWorkspaceId
      ? await getMonitorCheckEvidence(session.activeWorkspaceId, parsedCheckId.data)
      : null;
    return NextResponse.json({ evidence });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load the check details right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
