import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { requireSession } from "@/lib/auth/authorization";
import { assertPermission, type Permission } from "@/lib/auth/permissions";
import { AuthError, toAuthError } from "@/lib/auth/errors";
import {
  assertSameOriginMutation,
  readJsonBody,
  STANDARD_JSON_BODY_LIMIT_BYTES,
} from "@/lib/http/json-body";

export async function requireMutationSession(request: NextRequest) {
  assertSameOriginMutation(request);
  return requireSession();
}

export async function requireMutationPermission(request: NextRequest, permission: Permission) {
  const session = await requireMutationSession(request);
  assertPermission(session.role, permission);
  return session;
}

export async function parseJsonRequest<T>(
  request: NextRequest,
  schema: ZodType<T>,
  fallbackMessage: string,
  maxBytes = STANDARD_JSON_BODY_LIMIT_BYTES
) {
  const parsed = schema.safeParse(await readJsonBody(request, maxBytes));
  if (!parsed.success) {
    throw new AuthError(parsed.error.issues[0]?.message ?? fallbackMessage, 400);
  }

  return parsed.data;
}

export function apiErrorResponse(error: unknown, fallbackMessage: string) {
  const resolved = toAuthError(error, fallbackMessage);
  return NextResponse.json({ message: resolved.message }, { status: resolved.status });
}
