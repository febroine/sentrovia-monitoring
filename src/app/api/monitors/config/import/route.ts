import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { parseMonitorConfigBundle } from "@/lib/monitors/config-service";
import { createManyMonitors } from "@/lib/monitors/service";
import { monitorInputSchema } from "@/lib/monitors/schemas";
import { getSettings } from "@/lib/settings/service";
import { applyMonitorDefaults } from "@/lib/monitors/defaults";
import { serializeMonitorRecord } from "@/lib/monitors/utils";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { format?: string; content?: string };
    const format = body.format === "yaml" ? "yaml" : "json";
    const content = body.content?.trim();

    if (!content) {
      return NextResponse.json({ message: "Paste a JSON or YAML monitor bundle first." }, { status: 400 });
    }

    const bundle = parseMonitorConfigBundle(content, format);
    const settings = await getSettings(session.id);
    const parsedMonitors = bundle.monitors.map((monitor, index) => {
      const parsed = monitorInputSchema.safeParse(applyMonitorDefaults(monitor, settings));
      if (!parsed.success) {
        throw new Error(`Monitor ${index + 1}: ${parsed.error.issues[0]?.message ?? "Invalid payload."}`);
      }
      return parsed.data;
    });

    const created = await createManyMonitors(session.id, parsedMonitors);
    return NextResponse.json({ monitors: created.map((monitor) => serializeMonitorRecord(monitor)) });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Monitor ")) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    const authError = toAuthError(error, "Unable to import monitor configuration right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
