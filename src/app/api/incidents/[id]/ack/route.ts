import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toAuthError } from "@/lib/auth/errors";
import { getSession } from "@/lib/auth/session";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import { acknowledgeIncident } from "@/lib/incidents/service";

const ackSchema = z.object({
  note: z.string().trim().max(1000).default(""),
});

type Params = Promise<{ id: string }>;

export async function POST(request: NextRequest, context: { params: Params }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const parsed = ackSchema.safeParse(await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES));
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid acknowledgement." }, { status: 400 });
    }

    const { id } = await context.params;
    const incident = await acknowledgeIncident({
      userId: session.id,
      incidentId: id,
      acknowledgedBy: session.id,
      note: parsed.data.note,
    });
    if (!incident) {
      return NextResponse.json({ message: "Open incident not found." }, { status: 404 });
    }

    return NextResponse.json({ incident });
  } catch (error) {
    const authError = toAuthError(error, "Unable to acknowledge the incident right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
