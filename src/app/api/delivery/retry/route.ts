import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { assertPermission } from "@/lib/auth/permissions";
import { getDeliveryOverview, retryDeliveryEvent, retryDeliveryQueue } from "@/lib/delivery/service";
import { assertSameOriginMutation } from "@/lib/http/json-body";

export const runtime = "nodejs";

const eventIdSchema = z.string().trim().min(1).max(128);

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    assertPermission(session.role, "delivery.manage");

    const eventId = new URL(request.url).searchParams.get("eventId");
    if (eventId !== null) {
      const parsedEventId = eventIdSchema.safeParse(eventId);
      if (!parsedEventId.success) {
        return NextResponse.json({ message: "Invalid delivery event id." }, { status: 400 });
      }

      const delivery = await retryDeliveryEvent(
        session.id,
        parsedEventId.data,
        session.activeWorkspaceId ?? undefined
      );
      if (!delivery) {
        return NextResponse.json(
          { message: "This delivery is no longer available for manual retry." },
          { status: 409 }
        );
      }

      const overview = await getDeliveryOverview(session.id, 1, true, session.activeWorkspaceId ?? undefined);
      return NextResponse.json({ delivery, overview });
    }

    const result = await retryDeliveryQueue(session.id, undefined, session.activeWorkspaceId ?? undefined);
    const overview = await getDeliveryOverview(session.id, 1, true, session.activeWorkspaceId ?? undefined);
    return NextResponse.json({ result, overview });
  } catch (error) {
    const authError = toAuthError(error, "Unable to process the delivery retry queue right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
