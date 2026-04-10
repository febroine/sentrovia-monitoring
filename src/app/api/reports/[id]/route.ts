import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { reportSchedulePatchSchema } from "@/lib/reports/schemas";
import { updateReportSchedule } from "@/lib/reports/service";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function PATCH(request: NextRequest, context: { params: Params }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const parsed = reportSchedulePatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid report schedule update." }, { status: 400 });
    }

    const { id } = await context.params;
    const schedule = await updateReportSchedule(session.id, id, parsed.data);
    if (!schedule) {
      return NextResponse.json({ message: "Report schedule not found." }, { status: 404 });
    }

    return NextResponse.json({ schedule });
  } catch (error) {
    const authError = toAuthError(error, "Unable to update the report schedule right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
