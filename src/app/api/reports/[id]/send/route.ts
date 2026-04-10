import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { dispatchReportNow, getReportScheduleById } from "@/lib/reports/service";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function POST(_request: NextRequest, context: { params: Params }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const schedule = await getReportScheduleById(session.id, id);
    if (!schedule) {
      return NextResponse.json({ message: "Report schedule not found." }, { status: 404 });
    }

    const result = await dispatchReportNow(
      session.id,
      {
        scope: schedule.scope,
        cadence: schedule.cadence,
        companyId: schedule.companyId,
      },
      schedule.recipientEmails
    );

    return NextResponse.json(result);
  } catch (error) {
    const authError = toAuthError(error, "Unable to send the scheduled report right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
