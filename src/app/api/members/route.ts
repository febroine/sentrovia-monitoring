import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { clearSessionCookie } from "@/lib/auth/session";
import { AuthError, toAuthError } from "@/lib/auth/errors";
import { flattenValidationIssues, memberCreateSchema } from "@/lib/auth/schemas";
import { createMember } from "@/lib/auth/service";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import { deleteMembers, listMembers } from "@/lib/members/service";

export const runtime = "nodejs";

const memberDeleteSchema = z.object({
  ids: z.array(z.string().trim().min(1)).min(1),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const members = await listMembers(session.id, session.role);
    return NextResponse.json({
      currentUserId: session.id,
      currentUserRole: session.role,
      members: members.map((member) => ({
        ...member,
        createdAt: member.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load members right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (session.role !== "admin") {
      throw new AuthError("Only admins can add members.", 403);
    }

    const body = await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES);
    const parsed = memberCreateSchema.safeParse(body);
    if (!parsed.success) {
      throw new AuthError(flattenValidationIssues(parsed.error), 400);
    }

    const result = await createMember(parsed.data);
    return NextResponse.json({ member: result.user }, { status: 201 });
  } catch (error) {
    const authError = toAuthError(error, "Unable to add member right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES);
    const parsed = memberDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: "Select at least one member." }, { status: 400 });
    }

    const deleted = await deleteMembers(session.id, session.role, parsed.data.ids);
    const deletedIds = deleted.map((member) => member.id);
    const response = NextResponse.json({
      ids: deletedIds,
      signedOut: deletedIds.includes(session.id),
    });

    return deletedIds.includes(session.id) ? clearSessionCookie(response) : response;
  } catch (error) {
    const authError = toAuthError(error, "Unable to delete members right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
