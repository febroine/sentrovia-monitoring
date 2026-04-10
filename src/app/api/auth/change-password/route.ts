import { NextRequest, NextResponse } from "next/server";
import { AuthError, toAuthError } from "@/lib/auth/errors";
import { clearAuthFailures, assertAuthRateLimit, recordAuthFailure } from "@/lib/auth/rate-limit";
import { applyAuthResponseHeaders } from "@/lib/auth/response";
import { getSession } from "@/lib/auth/session";
import { changePasswordSchema, flattenValidationIssues } from "@/lib/auth/schemas";
import { changeUserPassword } from "@/lib/auth/service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let identifier: string | null = null;

  try {
    const session = await getSession();

    if (!session) {
      throw new AuthError("Unauthorized.", 401);
    }

    identifier = session.email;
    assertAuthRateLimit(request, "change-password", identifier);

    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);

    if (!parsed.success) {
      throw new AuthError(flattenValidationIssues(parsed.error), 400);
    }

    await changeUserPassword(session.id, parsed.data);
    clearAuthFailures(request, "change-password", identifier);

    return applyAuthResponseHeaders(
      NextResponse.json({
        message: "Password updated successfully.",
      })
    );
  } catch (error) {
    const authError =
      error instanceof AuthError ? error : toAuthError(error, "Unable to change your password right now.");

    if (shouldRecordFailure(authError.status)) {
      recordAuthFailure(request, "change-password", identifier);
    }

    return applyAuthResponseHeaders(
      NextResponse.json(
        {
          message: authError.message,
        },
        {
          status: authError.status,
        }
      )
    );
  }
}

function shouldRecordFailure(status: number) {
  return status >= 400 && status < 500 && status !== 429;
}
