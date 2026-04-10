import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { getDeliveryOverview, upsertWebhookSettings } from "@/lib/delivery/service";

export const runtime = "nodejs";

const webhookSchema = z.object({
  url: z.string().trim().url(),
  secret: z.string().trim().max(255).default(""),
  isActive: z.boolean(),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const overview = await getDeliveryOverview(session.id);
    return NextResponse.json({ overview });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load delivery operations right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const parsed = webhookSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid webhook payload." }, { status: 400 });
    }

    await upsertWebhookSettings(session.id, parsed.data);
    const overview = await getDeliveryOverview(session.id);
    return NextResponse.json({ overview });
  } catch (error) {
    const authError = toAuthError(error, "Unable to save webhook delivery settings right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
