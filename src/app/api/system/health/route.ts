import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/authorization";
import { toAuthError } from "@/lib/auth/errors";
import { getSystemHealth } from "@/lib/system/health-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireAdminSession();
    return NextResponse.json({ health: await getSystemHealth() });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load system health right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
