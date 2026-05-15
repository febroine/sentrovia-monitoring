import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { clearSessionCookie } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
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

    const members = await listMembers();
    return NextResponse.json({
      currentUserId: session.id,
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

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = memberDeleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: "Select at least one member." }, { status: 400 });
    }

    if (parsed.data.ids.some((id) => id !== session.id)) {
      return NextResponse.json({ message: "You can only delete your own account." }, { status: 403 });
    }

    const deleted = await deleteMembers(session.id, parsed.data.ids);
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
