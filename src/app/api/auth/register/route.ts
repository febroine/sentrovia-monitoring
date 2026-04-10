import { NextRequest, NextResponse } from "next/server";
import { AuthError, toAuthError } from "@/lib/auth/errors";
import { clearAuthFailures, assertAuthRateLimit, recordAuthFailure } from "@/lib/auth/rate-limit";
import { applyAuthResponseHeaders } from "@/lib/auth/response";
import { flattenValidationIssues, registerSchema } from "@/lib/auth/schemas";
import { applySessionCookie } from "@/lib/auth/session";
import { registerUser } from "@/lib/auth/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let submittedEmail: string | null = null;

  try {
    const body = await request.json();
    submittedEmail = readSubmittedEmail(body);
    assertAuthRateLimit(request, "register", submittedEmail);
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      throw new AuthError(flattenValidationIssues(parsed.error), 400);
    }

    const result = await registerUser(parsed.data);
    clearAuthFailures(request, "register", parsed.data.email);
    const response = NextResponse.json(
      {
        message: "Account created successfully.",
        user: result.user,
      },
      {
        status: 201,
      }
    );

    return applySessionCookie(response, result.token);
  } catch (error) {
    const authError =
      error instanceof AuthError
        ? error
        : toAuthError(error, "Unable to create your account right now.");
    if (shouldRecordFailure(authError.status)) {
      recordAuthFailure(request, "register", submittedEmail);
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

function readSubmittedEmail(body: unknown) {
  if (!body || typeof body !== "object") {
    return null;
  }

  const email = (body as Record<string, unknown>).email;
  return typeof email === "string" ? email : null;
}

function shouldRecordFailure(status: number) {
  return status >= 400 && status < 500 && status !== 429;
}
