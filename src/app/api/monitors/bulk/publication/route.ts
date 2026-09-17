import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { assertPermission } from "@/lib/auth/permissions";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import { bulkUpdateMonitorPublication } from "@/lib/monitors/service";
import { serializeMonitorRecord } from "@/lib/monitors/utils";

export const runtime = "nodejs";

const payloadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500).refine((ids) => new Set(ids).size === ids.length),
  publishOnStatusPage: z.boolean(),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    assertPermission(session.role, "monitors.manage");
    const parsed = payloadSchema.safeParse(await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES));
    if (!parsed.success) {
      return NextResponse.json({ message: "Invalid monitor publication request." }, { status: 400 });
    }
    const monitors = await bulkUpdateMonitorPublication(
      parsed.data.ids, parsed.data.publishOnStatusPage, session.activeWorkspaceId!
    );
    return NextResponse.json({ monitors: monitors.map((monitor) => serializeMonitorRecord(monitor)) });
  } catch (error) {
    const authError = toAuthError(error, "Unable to update public status visibility right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
