import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import { monitorBulkDeleteSchema } from "@/lib/monitors/schemas";
import { restoreMonitors } from "@/lib/monitors/service";
import { serializeMonitorRecord } from "@/lib/monitors/utils";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const parsed = monitorBulkDeleteSchema.safeParse(
      await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES)
    );
    if (!parsed.success) {
      return NextResponse.json({ message: "Select at least one monitor to restore." }, { status: 400 });
    }

    const restored = await restoreMonitors(session.id, parsed.data.ids);
    if (restored.length === 0) {
      return NextResponse.json({ message: "The monitor restore window has expired." }, { status: 409 });
    }
    return NextResponse.json({ monitors: restored.map(serializeMonitorRecord) });
  } catch (error) {
    const authError = toAuthError(error, "Unable to restore monitors right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
