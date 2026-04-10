import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { updateMonitorTags } from "@/lib/monitors/service";
import { serializeMonitorRecord } from "@/lib/monitors/utils";

export const runtime = "nodejs";

const tagPatchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  action: z.enum(["add", "remove", "replace"]),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
});

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = tagPatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid tag patch payload." }, { status: 400 });
    }

    const monitors = await updateMonitorTags(session.id, parsed.data.ids, parsed.data.action, parsed.data.tags);
    return NextResponse.json({ monitors: monitors.map((monitor) => serializeMonitorRecord(monitor)) });
  } catch (error) {
    const authError = toAuthError(error, "Unable to update monitor tags right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
