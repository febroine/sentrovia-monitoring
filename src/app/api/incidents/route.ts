import { NextResponse } from "next/server";
import { toAuthError } from "@/lib/auth/errors";
import { getSession } from "@/lib/auth/session";
import { getIncidentOverview } from "@/lib/incidents/service";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ overview: await getIncidentOverview(session.id) });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load incidents right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
