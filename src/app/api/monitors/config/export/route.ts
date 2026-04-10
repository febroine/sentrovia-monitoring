import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { buildMonitorConfigBundle, serializeMonitorConfigBundle } from "@/lib/monitors/config-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const format = request.nextUrl.searchParams.get("format") === "yaml" ? "yaml" : "json";
    const bundle = await buildMonitorConfigBundle(session.id);
    const body = serializeMonitorConfigBundle(bundle, format);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": format === "yaml" ? "application/yaml" : "application/json",
        "Content-Disposition": `attachment; filename="sentrovia-monitors.${format}"`,
      },
    });
  } catch (error) {
    const authError = toAuthError(error, "Unable to export monitor configuration right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
