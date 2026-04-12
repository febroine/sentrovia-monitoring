import { cache } from "react";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { applyAuthResponseHeaders } from "@/lib/auth/response";
import { getActiveSessionUser } from "@/lib/auth/service";
import {
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
  type SessionPayload,
  verifySessionToken,
} from "@/lib/auth/token";

export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const cookieStore = await cookies();
  const tokenPayload = await verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!tokenPayload) {
    return null;
  }

  return getActiveSessionUser(tokenPayload.id);
});

export function applySessionCookie(response: NextResponse, token: string) {
  applyAuthResponseHeaders(response);
  response.cookies.set({
    ...getSessionCookieOptions(),
    value: token,
  });

  return response;
}

export function clearSessionCookie(response: NextResponse) {
  applyAuthResponseHeaders(response);
  response.cookies.set({
    ...getSessionCookieOptions(),
    value: "",
    maxAge: 0,
  });

  return response;
}
