import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { duplicateReportSchedule } from "@/lib/reports/service";
import { assertSameOriginMutation } from "@/lib/http/json-body";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function POST(request: NextRequest, context: { params: Params }) {
  try {
    assertSameOriginMutation(request);
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const schedule = await duplicateReportSchedule(session.id, id);
    if (!schedule) {
      return NextResponse.json({ message: "Report schedule not found." }, { status: 404 });
    }

    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    const authError = toAuthError(error, "Unable to duplicate the report schedule right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
