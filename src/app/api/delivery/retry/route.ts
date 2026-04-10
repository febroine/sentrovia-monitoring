import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { getDeliveryOverview, retryWebhookQueue } from "@/lib/delivery/service";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const result = await retryWebhookQueue(session.id);
    const overview = await getDeliveryOverview(session.id);
    return NextResponse.json({ result, overview });
  } catch (error) {
    const authError = toAuthError(error, "Unable to process the webhook retry queue right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
