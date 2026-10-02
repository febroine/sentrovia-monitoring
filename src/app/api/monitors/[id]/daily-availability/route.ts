import { NextResponse } from "next/server";
import { toAuthError } from "@/lib/auth/errors";
import { getSession } from "@/lib/auth/session";
import { loadMonitorDailyAvailability } from "@/lib/monitors/daily-availability";
import { getSettings } from "@/lib/settings/service";
import { resolveTimeDisplaySettings } from "@/lib/time";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ message: "Invalid monitor id." }, { status: 400 });
    }

    const settings = await getSettings(session.id, false, session.activeWorkspaceId!);
    // Days follow the time zone the console shows times in.
    const { timeZone } = resolveTimeDisplaySettings(settings?.appearance);
    const days = await loadMonitorDailyAvailability(session.activeWorkspaceId!, id, timeZone);
    if (!days) {
      return NextResponse.json({ message: "Monitor not found." }, { status: 404 });
    }
    return NextResponse.json({ timeZone, days });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load daily availability right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
