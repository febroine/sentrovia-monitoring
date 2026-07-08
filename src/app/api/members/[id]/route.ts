import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import { updateMember } from "@/lib/members/service";

export const runtime = "nodejs";

const memberUsernameUpdateSchema = z
  .string()
  .trim()
  .max(80, "Username is too long.")
  .transform((value) => value.toLowerCase())
  .refine((value) => value.length === 0 || value.length >= 3, "Username must be at least 3 characters long.")
  .refine(
    (value) => value.length === 0 || /^[a-z0-9._-]+$/.test(value),
    "Username can only include letters, numbers, dots, underscores, and dashes."
  );

const memberUpdateSchema = z.object({
  username: memberUsernameUpdateSchema.default(""),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
});

type Params = Promise<{ id: string }>;

export async function PATCH(request: NextRequest, context: { params: Params }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES);
    const parsed = memberUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid member payload." }, { status: 400 });
    }

    const { id } = await context.params;
    if (id !== session.id && session.role !== "admin") {
      return NextResponse.json({ message: "You can only edit your own account." }, { status: 403 });
    }

    const member = await updateMember(id, session.id, parsed.data);
    if (!member) {
      return NextResponse.json({ message: "Member not found." }, { status: 404 });
    }

    return NextResponse.json({
      member: {
        ...member,
        createdAt: member.createdAt.toISOString(),
      },
    });
  } catch (error) {
    const authError = toAuthError(error, "Unable to update the member right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
