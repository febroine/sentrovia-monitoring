import { NextResponse, type NextRequest } from "next/server";
import { resolveSafeAuthRedirect } from "@/lib/auth/redirect";
import { SESSION_COOKIE_NAME, getSessionCookieOptions, verifySessionToken } from "@/lib/auth/token";
import { hasPermission, type Permission } from "@/lib/auth/permissions";

const PUBLIC_ROUTES = ["/login", "/onboarding"];
const PUBLIC_API_ROUTES = [
  "/api/auth/login",
  "/api/auth/onboarding",
  "/api/metrics",
  "/api/monitors/heartbeat/",
];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (isPublicApiRoute(pathname)) {
    return NextResponse.next();
  }
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);

  if (!isPublicRoute(pathname) && !session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", resolveSafeAuthRedirect(pathname));
    const response = NextResponse.redirect(loginUrl);
    if (request.cookies.has(SESSION_COOKIE_NAME)) {
      response.cookies.set({
        ...getSessionCookieOptions(),
        value: "",
        maxAge: 0,
      });
    }
    return response;
  }

  const permission = resolveApiMutationPermission(pathname, request.method);
  if (permission && session && !hasPermission(session.role, permission)) {
    return NextResponse.json(
      { message: "You do not have permission to perform this action." },
      { status: 403 }
    );
  }

  return NextResponse.next();
}

export function resolveApiMutationPermission(pathname: string, method: string): Permission | null {
  if (!pathname.startsWith("/api/") || ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return null;
  if (pathname.startsWith("/api/monitors")) return "monitors.manage";
  if (pathname.startsWith("/api/companies")) return "companies.manage";
  if (pathname.startsWith("/api/delivery")) return "delivery.manage";
  if (pathname.startsWith("/api/reports")) return "reports.manage";
  if (pathname.startsWith("/api/notifications")) return "settings.manage";
  if (pathname === "/api/settings") return "settings.manage";
  if (pathname === "/api/logs") return "audit.read";
  if (pathname.startsWith("/api/system/backup")) return "backups.manage";
  if (pathname === "/api/worker") return "worker.manage";
  return null;
}

function isPublicApiRoute(pathname: string) {
  return PUBLIC_API_ROUTES.some((route) => pathname === route || (
    route.endsWith("/") && pathname.startsWith(route)
  ));
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
    "/settings/:path*",
    "/api/:path*",
  ],
};
