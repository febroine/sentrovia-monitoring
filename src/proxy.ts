import { NextResponse, type NextRequest } from "next/server";
import { resolveSafeAuthRedirect } from "@/lib/auth/redirect";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/token";

const PUBLIC_ROUTES = ["/login", "/onboarding"];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!isPublicRoute(pathname) && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", resolveSafeAuthRedirect(pathname));
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/onboarding",
    "/dashboard/:path*",
    "/monitoring/:path*",
    "/companies/:path*",
    "/members/:path*",
    "/profile/:path*",
    "/help/:path*",
    "/about/:path*",
    "/logs/:path*",
    "/delivery/:path*",
    "/reports/:path*",
    "/status-codes/:path*",
    "/settings/:path*",
    "/system-health/:path*",
  ],
};
