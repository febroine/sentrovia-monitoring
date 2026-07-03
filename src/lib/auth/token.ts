import { SignJWT, jwtVerify } from "jose";
import { env, getAuthSecret } from "@/lib/env";

export const SESSION_COOKIE_NAME = "sentrovia.session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_ISSUER = "sentrovia-auth";
const SESSION_AUDIENCE = "sentrovia-session";
export const DEFAULT_SESSION_VERSION = 1;
export type UserRole = "admin" | "member";

export interface SessionUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string | null;
  role: UserRole;
}

export type SessionPayload = SessionUser;

export interface VersionedSessionPayload extends SessionPayload {
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

export async function createSessionToken(user: SessionUser, sessionVersion = DEFAULT_SESSION_VERSION) {
  return new SignJWT({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    department: user.department,
    role: user.role,
    sessionVersion,
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
    const firstName = typeof payload.firstName === "string" ? payload.firstName : null;
    const lastName = typeof payload.lastName === "string" ? payload.lastName : null;
    const email = typeof payload.email === "string" ? payload.email : null;
    const department = typeof payload.department === "string" ? payload.department : null;
    const role = parseUserRole(payload.role);
    const sessionVersion =
      typeof payload.sessionVersion === "number" && Number.isInteger(payload.sessionVersion)
        ? payload.sessionVersion
        : DEFAULT_SESSION_VERSION;

    if (!id || !firstName || !lastName || !email) {
      return null;
    }

    return {
      id,
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
  return value === "admin" ? "admin" : "member";
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
