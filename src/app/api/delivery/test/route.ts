import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { sendDeliveryTest } from "@/lib/delivery/service";

export const runtime = "nodejs";

const testSchema = z.object({
  channel: z.enum(["email", "telegram", "webhook", "discord"]),
  destination: z.string().trim().max(500).optional(),
  botToken: z.string().trim().max(255).optional(),
  chatId: z.string().trim().max(255).optional(),
  message: z.string().trim().max(4000).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const parsed = testSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid delivery test payload." }, { status: 400 });
    }

    const result = await sendDeliveryTest(session.id, parsed.data);
    if (result?.status !== "delivered") {
      return NextResponse.json(
        { delivery: result, message: result?.errorMessage ?? "Delivery test failed." },
        { status: 502 }
      );
    }

    return NextResponse.json({ delivery: result });
  } catch (error) {
    const authError = toAuthError(error, "Unable to send the test delivery right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
