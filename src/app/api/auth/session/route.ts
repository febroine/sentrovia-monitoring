import { NextResponse } from "next/server";
import { applyAuthResponseHeaders } from "@/lib/auth/response";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return applyAuthResponseHeaders(NextResponse.json({ message: "Unauthorized" }, { status: 401 }));
  }

  return applyAuthResponseHeaders(NextResponse.json({ user: session }));
}
