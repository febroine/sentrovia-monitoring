import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { reportPreviewSchema } from "@/lib/reports/schemas";
import { generateReportPreview } from "@/lib/reports/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const parsed = reportPreviewSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid report preview payload." }, { status: 400 });
    }

    const report = await generateReportPreview(session.id, parsed.data);
    return NextResponse.json({ report });
  } catch (error) {
    const authError = toAuthError(error, "Unable to generate the report preview right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
