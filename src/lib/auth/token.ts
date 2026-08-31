import { SignJWT, jwtVerify } from "jose";
import { env, getAuthSecret, getAuthSessionId } from "@/lib/env";
import { normalizeUserRole, type UserRole } from "@/lib/auth/permissions";

export type { UserRole } from "@/lib/auth/permissions";

export const SESSION_COOKIE_NAME = "sentrovia.session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_ISSUER = "sentrovia-auth";
const SESSION_AUDIENCE = "sentrovia-session";
export const DEFAULT_SESSION_VERSION = 1;

export interface SessionUser {
  id: string;
  activeWorkspaceId: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string | null;
  role: UserRole;
}

export type SessionPayload = SessionUser;

export interface VersionedSessionPayload extends Omit<SessionPayload, "activeWorkspaceId"> {
  activeWorkspaceId?: string | null;
  sessionVersion: number;
}

function getJwtKey() {
  return new TextEncoder().encode(getAuthSecret());
}

function shouldUseSecureSessionCookie() {
  try {
    const appUrl = new URL(env.appUrl);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
    return appUrl.protocol === "https:" && !localHosts.has(appUrl.hostname);
  } catch {
    return process.env.NODE_ENV === "production";
  }
}

export async function createSessionToken(
  user: SessionUser | Omit<SessionUser, "activeWorkspaceId">,
  sessionVersion = DEFAULT_SESSION_VERSION
) {
  const activeWorkspaceId = "activeWorkspaceId" in user ? user.activeWorkspaceId : undefined;
  return new SignJWT({
    id: user.id,
    activeWorkspaceId,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    department: user.department,
    role: user.role,
    sessionVersion,
    sessionId: getAuthSessionId(),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getJwtKey());
}

export async function verifySessionToken(token?: string | null): Promise<VersionedSessionPayload | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getJwtKey(), {
      algorithms: ["HS256"],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });

    const id = typeof payload.id === "string" ? payload.id : null;
    const activeWorkspaceId = typeof payload.activeWorkspaceId === "string" ? payload.activeWorkspaceId : null;
    const firstName = typeof payload.firstName === "string" ? payload.firstName : null;
    const lastName = typeof payload.lastName === "string" ? payload.lastName : null;
    const email = typeof payload.email === "string" ? payload.email : null;
    const department = typeof payload.department === "string" ? payload.department : null;
    const role = parseUserRole(payload.role);
    const sessionVersion =
      typeof payload.sessionVersion === "number" && Number.isInteger(payload.sessionVersion)
        ? payload.sessionVersion
        : DEFAULT_SESSION_VERSION;
    const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : null;

    if (!id || !firstName || !lastName || !email || sessionId !== getAuthSessionId()) {
      return null;
    }

    return {
      id,
      activeWorkspaceId,
      firstName,
      lastName,
      email,
      department,
      role,
      sessionVersion,
    };
  } catch {
    return null;
  }
}

function parseUserRole(value: unknown): UserRole {
  return normalizeUserRole(value);
}

export function getSessionCookieOptions() {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    sameSite: "strict" as const,
    secure: shouldUseSecureSessionCookie(),
    path: "/",
    priority: "high" as const,
    maxAge: SESSION_TTL_SECONDS,
  };
}
