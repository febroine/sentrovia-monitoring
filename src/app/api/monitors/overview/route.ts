import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { getIncidentOverview } from "@/lib/incidents/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const overview = await getIncidentOverview(session.id);
    return NextResponse.json({ overview });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load incident overview right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
