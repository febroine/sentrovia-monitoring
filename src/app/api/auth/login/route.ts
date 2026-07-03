import { NextRequest, NextResponse } from "next/server";
import { AuthError, toAuthError } from "@/lib/auth/errors";
import { clearAuthFailures, assertAuthRateLimit, recordAuthFailure } from "@/lib/auth/rate-limit";
import { applyAuthResponseHeaders } from "@/lib/auth/response";
import { loginSchema, flattenValidationIssues } from "@/lib/auth/schemas";
import { applySessionCookie } from "@/lib/auth/session";
import { loginUser } from "@/lib/auth/service";
import { readJsonBody } from "@/lib/http/json-body";

export const runtime = "nodejs";
const AUTH_JSON_BODY_LIMIT_BYTES = 32_000;

export async function POST(request: NextRequest) {
  let submittedIdentifier: string | null = null;

  try {
    const body = await readJsonBody(request, AUTH_JSON_BODY_LIMIT_BYTES);
    const loginBody = normalizeLoginBody(body);
    submittedIdentifier = readSubmittedIdentifier(loginBody);
    assertAuthRateLimit(request, "login", submittedIdentifier);
    const parsed = loginSchema.safeParse(loginBody);

    if (!parsed.success) {
      throw new AuthError(flattenValidationIssues(parsed.error), 400);
    }

    const result = await loginUser(parsed.data);
    clearAuthFailures(request, "login", parsed.data.identifier);
    const response = NextResponse.json({
      message: "Signed in successfully.",
      user: result.user,
    });

    return applySessionCookie(response, result.token);
  } catch (error) {
    const authError =
      error instanceof AuthError ? error : toAuthError(error, "Unable to sign in right now.");
    if (shouldRecordFailure(authError.status)) {
      recordAuthFailure(request, "login", submittedIdentifier);
    }

    return applyAuthResponseHeaders(NextResponse.json(
      {
        message: authError.message,
      },
      {
        status: authError.status,
      }
    ));
  }
}

function readSubmittedIdentifier(body: unknown) {
  if (!body || typeof body !== "object") {
    return null;
  }

  const record = body as Record<string, unknown>;
  const identifier = record.identifier ?? record.email;
  return typeof identifier === "string" ? identifier : null;
}

function normalizeLoginBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }

  const record = body as Record<string, unknown>;
  if (typeof record.identifier === "string") {
    return body;
  }

  if (typeof record.email !== "string") {
    return body;
  }

  return {
    ...record,
    identifier: record.email,
  };
}

function shouldRecordFailure(status: number) {
  return status >= 400 && status < 500 && status !== 429;
}
