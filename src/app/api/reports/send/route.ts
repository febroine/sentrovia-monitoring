import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import { reportDispatchSchema } from "@/lib/reports/schemas";
import { dispatchReportNow } from "@/lib/reports/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const parsed = reportDispatchSchema.safeParse(await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES));
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid report delivery payload." }, { status: 400 });
    }

    const result = await dispatchReportNow(session.id, parsed.data, parsed.data.recipientEmails);
    return NextResponse.json(result);
  } catch (error) {
    const authError = toAuthError(error, "Unable to send the report right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
