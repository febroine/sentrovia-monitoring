import { NextResponse } from "next/server";
import { toAuthError } from "@/lib/auth/errors";
import { getSession } from "@/lib/auth/session";
import { getUpdateStatus } from "@/lib/updates/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ update: await getUpdateStatus() });
  } catch (error) {
    const authError = toAuthError(error, "Unable to check updates right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
