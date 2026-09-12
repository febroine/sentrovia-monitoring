import { NextRequest, NextResponse } from "next/server";
import { AuthError, toAuthError } from "@/lib/auth/errors";
import { applyAuthResponseHeaders } from "@/lib/auth/response";
import { flattenValidationIssues, getValidationFieldErrors, onboardingSchema } from "@/lib/auth/schemas";
import { applySessionCookie } from "@/lib/auth/session";
import { createInitialAdmin, isOnboardingRequired } from "@/lib/auth/service";
import { assertAuthRateLimit, clearAuthFailures, recordAuthFailure } from "@/lib/auth/rate-limit";
import { readJsonBody } from "@/lib/http/json-body";

export const runtime = "nodejs";
const AUTH_JSON_BODY_LIMIT_BYTES = 32_000;

export async function GET() {
  try {
    return applyAuthResponseHeaders(
      NextResponse.json({
        required: await isOnboardingRequired(),
      })
    );
  } catch (error) {
    const authError = toAuthError(error, "Unable to check workspace setup right now.");
    return applyAuthResponseHeaders(NextResponse.json({ message: authError.message }, { status: authError.status }));
  }
}

export async function POST(request: NextRequest) {
  let attemptedCreation = false;

  try {
    const body = await readJsonBody(request, AUTH_JSON_BODY_LIMIT_BYTES);
    await assertAuthRateLimit(request, "onboarding");
    const parsed = onboardingSchema.safeParse(body);
    if (!parsed.success) {
      return applyAuthResponseHeaders(
        NextResponse.json(
          {
            message: flattenValidationIssues(parsed.error),
            fieldErrors: getValidationFieldErrors(parsed.error),
          },
          { status: 400 }
        )
      );
    }

    attemptedCreation = true;
    const result = await createInitialAdmin(parsed.data);
    await clearAuthFailures(request, "onboarding");

    const response = NextResponse.json(
      {
        message: "Workspace admin created successfully.",
        user: result.user,
      },
      { status: 201 }
    );

    return applySessionCookie(response, result.token);
  } catch (error) {
    const authError = error instanceof AuthError ? error : toAuthError(error, "Unable to finish onboarding right now.");
    if (attemptedCreation && authError.status >= 400 && authError.status < 500 && authError.status !== 429) {
      await recordAuthFailure(request, "onboarding");
    }
    return applyAuthResponseHeaders(NextResponse.json({ message: authError.message }, { status: authError.status }));
  }
}
