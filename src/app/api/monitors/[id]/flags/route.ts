import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toAuthError } from "@/lib/auth/errors";
import { getSession } from "@/lib/auth/session";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import { updateMonitorFlags } from "@/lib/monitors/service";
import { serializeMonitorRecord } from "@/lib/monitors/utils";

export const runtime = "nodejs";

type MonitorFlagsRouteContext = {
  params: Promise<{ id: string }>;
};

const monitorFlagsSchema = z
  .object({
    isFavorite: z.boolean().optional(),
    isCritical: z.boolean().optional(),
  })
  .refine((value) => value.isFavorite !== undefined || value.isCritical !== undefined, {
    message: "At least one dashboard flag is required.",
  });

export async function PATCH(request: NextRequest, context: MonitorFlagsRouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES);
    const parsed = monitorFlagsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Invalid dashboard flag payload." },
        { status: 400 }
      );
    }

    const monitor = await updateMonitorFlags(
      session.id,
      id,
      parsed.data,
      session.activeWorkspaceId!
    );
    if (!monitor) {
      return NextResponse.json({ message: "Monitor not found." }, { status: 404 });
    }

    return NextResponse.json({ monitor: serializeMonitorRecord(monitor) });
  } catch (error) {
    const authError = toAuthError(error, "Unable to update monitor dashboard flags right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
