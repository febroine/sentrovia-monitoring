import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { reportScheduleSchema } from "@/lib/reports/schemas";
import { createReportSchedule, listReportSchedules } from "@/lib/reports/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const schedules = await listReportSchedules(session.id);
    return NextResponse.json({ schedules });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load reports right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const parsed = reportScheduleSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid report schedule payload." }, { status: 400 });
    }

    const schedule = await createReportSchedule(session.id, parsed.data);
    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    const authError = toAuthError(error, "Unable to create the report schedule right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
