import { cache } from "react";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { applyAuthResponseHeaders } from "@/lib/auth/response";
import {
  SESSION_COOKIE_NAME,
  getSessionCookieOptions,
  type SessionPayload,
  verifySessionToken,
} from "@/lib/auth/token";

export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
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
