import { NextRequest, NextResponse } from "next/server";
import { toAuthError } from "@/lib/auth/errors";
import { assertPermission } from "@/lib/auth/permissions";
import { recordAuditEventSafely } from "@/lib/audit/service";
import { getSession } from "@/lib/auth/session";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import {
  createPublicStatusPage,
  listPublicStatusPages,
} from "@/lib/public-status/pages-service";
import { publicStatusPageInputSchema } from "@/lib/public-status/schemas";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ pages: await listPublicStatusPages(session.id) });
  } catch (error) {
    const resolved = toAuthError(error, "Unable to load public status pages right now.");
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
}

export async function POST(request: NextRequest) {
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

    const page = await createPublicStatusPage(session.id, parsed.data);
    if (!page) {
      throw new Error("The public status page could not be loaded after creation.");
    }
    await recordAuditEventSafely({
      userId: session.id,
      actorUserId: session.id,
      actorLabel: session.email,
      entityType: "settings",
      entityId: page.id,
      entityLabel: page.slug,
      action: "public_status.created",
      summary: "A public status page was created.",
    });
    return NextResponse.json({ page }, { status: 201 });
  } catch (error) {
    const resolved = toAuthError(error, "Unable to create the public status page right now.");
    return NextResponse.json({ message: resolved.message }, { status: resolved.status });
  }
}
