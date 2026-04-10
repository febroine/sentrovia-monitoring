import { SignJWT, jwtVerify } from "jose";
import { getAuthSecret } from "@/lib/env";

export const SESSION_COOKIE_NAME = "sentrovia.session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const SESSION_ISSUER = "sentrovia-auth";
const SESSION_AUDIENCE = "sentrovia-session";

export interface SessionUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  department: string | null;
}

export type SessionPayload = SessionUser;

function getJwtKey() {
  return new TextEncoder().encode(getAuthSecret());
}

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    department: user.department,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getJwtKey());
}

export async function verifySessionToken(token?: string | null): Promise<SessionPayload | null> {
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

    if (!id || !firstName || !lastName || !email) {
      return null;
    }

    return {
      id,
      firstName,
      lastName,
      email,
      department,
    };
  } catch {
    return null;
  }
}

export function getSessionCookieOptions() {
  return {
    name: SESSION_COOKIE_NAME,
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    priority: "high" as const,
    maxAge: SESSION_TTL_SECONDS,
  };
}
