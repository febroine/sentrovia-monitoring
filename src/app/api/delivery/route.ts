import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { isValidCalendarDate, resolveDeliveryHistoryRange } from "@/lib/delivery/history-range";
import { deleteDeliveryHistory, getDeliveryOverview, upsertWebhookSettings } from "@/lib/delivery/service";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";

export const runtime = "nodejs";

const webhookSchema = z.object({
  url: z.string().trim().url(),
  secret: z.string().trim().max(255).default(""),
  isActive: z.boolean(),
});

const pageSchema = z.coerce.number().int().min(1).max(1_000_000);
const historyDeletionSchema = z
  .object({
    range: z.enum(["last_7_days", "last_30_days", "custom"]),
    from: z.string().optional(),
    to: z.string().optional(),
    timezoneOffsetMinutes: z.number().int().min(-840).max(840).optional(),
  })
  .superRefine((value, context) => {
    if (value.range !== "custom") {
      return;
    }

    if (!isValidCalendarDate(value.from) || !isValidCalendarDate(value.to)) {
      context.addIssue({ code: "custom", message: "Enter valid start and end dates." });
      return;
    }

    if (value.from! > value.to!) {
      context.addIssue({ code: "custom", message: "The start date must not be after the end date." });
    }
  });

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const parsedPage = pageSchema.safeParse(new URL(request.url).searchParams.get("page") ?? "1");
    if (!parsedPage.success) {
      return NextResponse.json({ message: "Invalid delivery history page." }, { status: 400 });
    }

    const overview = await getDeliveryOverview(session.id, parsedPage.data);
    return NextResponse.json({ overview });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load delivery operations right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const parsed = historyDeletionSchema.safeParse(
      await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Invalid delivery history range." },
        { status: 400 }
      );
    }

    const deletedCount = await deleteDeliveryHistory(session.id, resolveDeliveryHistoryRange(parsed.data));
    const overview = await getDeliveryOverview(session.id, 1);
    return NextResponse.json({ count: deletedCount, overview });
  } catch (error) {
    const authError = toAuthError(error, "Unable to delete delivery history right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const parsed = webhookSchema.safeParse(await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES));
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
