import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { applyMonitorDefaults } from "@/lib/monitors/defaults";
import { monitorBulkUpdateSchema } from "@/lib/monitors/schemas";
import { bulkUpdateMonitors } from "@/lib/monitors/service";
import { serializeMonitorRecord } from "@/lib/monitors/utils";
import { getSettings } from "@/lib/settings/service";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const settings = await getSettings(session.id);
    const payloadWithDefaults = {
      ...body,
      payload: applyMonitorDefaults(body?.payload, settings),
    };
    const parsed = monitorBulkUpdateSchema.safeParse(payloadWithDefaults);

    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid bulk monitor payload." }, { status: 400 });
    }

    const monitors = await bulkUpdateMonitors(session.id, parsed.data.ids, parsed.data.payload);

    return NextResponse.json({
      monitors: monitors.map((monitor) => serializeMonitorRecord(monitor)),
    });
  } catch (error) {
    const authError = toAuthError(error, "Unable to update the selected monitors right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
