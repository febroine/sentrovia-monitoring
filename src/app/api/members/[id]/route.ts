import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { updateMember } from "@/lib/members/service";

export const runtime = "nodejs";

const memberUpdateSchema = z.object({
  username: z.string().trim().max(80).default(""),
  email: z.string().trim().email(),
});

type Params = Promise<{ id: string }>;

export async function PATCH(request: NextRequest, context: { params: Params }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = memberUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid member payload." }, { status: 400 });
    }

    const { id } = await context.params;
    const member = await updateMember(id, parsed.data);
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
