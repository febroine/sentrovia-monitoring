import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { getCompanySlaReport } from "@/lib/monitors/service";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function GET(_request: NextRequest, context: { params: Params }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const report = await getCompanySlaReport(session.id, id);

    if (!report) {
      return NextResponse.json({ message: "Company report not found." }, { status: 404 });
    }

    return NextResponse.json({ report });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load the company SLA report right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
