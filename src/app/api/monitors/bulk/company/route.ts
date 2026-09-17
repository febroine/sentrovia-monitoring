import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { assertPermission } from "@/lib/auth/permissions";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import { monitorBulkCompanySchema } from "@/lib/monitors/schemas";
import { bulkMoveMonitorsToCompany } from "@/lib/monitors/service";
import { serializeMonitorRecord } from "@/lib/monitors/utils";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    assertPermission(session.role, "monitors.manage");

    const body = await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES);
    const parsed = monitorBulkCompanySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: "Invalid company assignment." }, { status: 400 });
    }

    const monitors = await bulkMoveMonitorsToCompany(
      session.id, parsed.data.ids, parsed.data.companyId, session.activeWorkspaceId!
    );
    return NextResponse.json({ monitors: monitors.map((monitor) => serializeMonitorRecord(monitor)) });
  } catch (error) {
    const authError = toAuthError(error, "Unable to move the selected monitors right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
