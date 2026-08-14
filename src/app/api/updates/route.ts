import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/authorization";
import { toAuthError } from "@/lib/auth/errors";
import { getUpdateStatus } from "@/lib/updates/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminSession();

    const response = NextResponse.json({ update: await getUpdateStatus() });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    const authError = toAuthError(error, "Unable to check updates right now.");
    const response = NextResponse.json({ message: authError.message }, { status: authError.status });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
