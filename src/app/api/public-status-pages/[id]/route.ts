import { NextRequest, NextResponse } from "next/server";
import { toAuthError } from "@/lib/auth/errors";
import { assertPermission } from "@/lib/auth/permissions";
import { recordAuditEventSafely } from "@/lib/audit/service";
import { getSession } from "@/lib/auth/session";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import {
  deletePublicStatusPage,
  updatePublicStatusPage,
} from "@/lib/public-status/pages-service";
import { publicStatusPageInputSchema } from "@/lib/public-status/schemas";

export const runtime = "nodejs";

type PublicStatusPageRouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: PublicStatusPageRouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    assertPermission(session.role, "settings.manage");

    const body = await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES);
    const parsed = publicStatusPageInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Invalid public status page payload." },
        { status: 400 }
      );
    }

    const { id } = await context.params;
    const page = await updatePublicStatusPage(
      session.id,
      id,
      parsed.data,
      undefined,
      session.activeWorkspaceId!
    );
    if (!page) {
      return NextResponse.json({ message: "Public status page not found." }, { status: 404 });
    }

await recordAuditEventSafely({
userId: session.id,
workspaceId: session.activeWorkspaceId!,
      actorUserId: session.id,
      actorLabel: session.email,
      entityType: "settings",
      entityId: page.id,
      entityLabel: page.slug,
      action: "public_status.updated",
      summary: "A public status page was updated.",
    });

    return NextResponse.json({ page });
  } catch (error) {
    const resolved = toAuthError(error, "Unable to update the public status page right now.");
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
}

export async function DELETE(_request: NextRequest, context: PublicStatusPageRouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    assertPermission(session.role, "settings.manage");

    const { id } = await context.params;
    const deleted = await deletePublicStatusPage(
      session.id,
      id,
      undefined,
      session.activeWorkspaceId!
    );
    if (!deleted) {
      return NextResponse.json({ message: "Public status page not found." }, { status: 404 });
    }

await recordAuditEventSafely({
userId: session.id,
workspaceId: session.activeWorkspaceId!,
      actorUserId: session.id,
      actorLabel: session.email,
      entityType: "settings",
      entityId: deleted.id,
      entityLabel: deleted.slug,
      action: "public_status.deleted",
      summary: "A public status page was deleted.",
    });

    return NextResponse.json({ id: deleted.id });
  } catch (error) {
    const resolved = toAuthError(error, "Unable to delete the public status page right now.");
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
}
