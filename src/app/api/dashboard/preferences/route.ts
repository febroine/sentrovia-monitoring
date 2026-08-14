import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toAuthError } from "@/lib/auth/errors";
import { getSession } from "@/lib/auth/session";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import { DASHBOARD_WIDGET_IDS } from "@/lib/dashboard/preferences";
import { saveDashboardPreferences } from "@/lib/dashboard/service";

export const runtime = "nodejs";

const dashboardPreferencesSchema = z.object({
  widgets: z.array(z.enum(DASHBOARD_WIDGET_IDS)).min(1).max(DASHBOARD_WIDGET_IDS.length),
  companyId: z.union([z.literal(""), z.string().uuid()]),
  focus: z.enum(["all", "favorites", "critical"]),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES);
    const parsed = dashboardPreferencesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Invalid dashboard preferences." },
        { status: 400 }
      );
    }

    const dashboard = await saveDashboardPreferences(session.id, parsed.data);
    return NextResponse.json({ dashboard });
  } catch (error) {
    const authError = toAuthError(error, "Unable to save dashboard preferences right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
