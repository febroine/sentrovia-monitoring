import { NextRequest, NextResponse } from "next/server";
import { AuthError, toAuthError } from "@/lib/auth/errors";
import { applyAuthResponseHeaders } from "@/lib/auth/response";
import { flattenValidationIssues, onboardingSchema } from "@/lib/auth/schemas";
import { applySessionCookie } from "@/lib/auth/session";
import { createInitialAdmin, isOnboardingRequired } from "@/lib/auth/service";
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
  try {
    const body = await readJsonBody(request, AUTH_JSON_BODY_LIMIT_BYTES);
    const parsed = onboardingSchema.safeParse(body);
    if (!parsed.success) {
      throw new AuthError(flattenValidationIssues(parsed.error), 400);
    }

    const result = await createInitialAdmin(parsed.data);

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
    return applyAuthResponseHeaders(NextResponse.json({ message: authError.message }, { status: authError.status }));
  }
}
