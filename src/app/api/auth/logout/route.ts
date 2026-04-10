import { NextResponse } from "next/server";
import { applyAuthResponseHeaders } from "@/lib/auth/response";
import { clearSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  const response = applyAuthResponseHeaders(
    NextResponse.json({ message: "Signed out successfully." })
  );
  return clearSessionCookie(response);
}
