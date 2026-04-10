import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toAuthError } from "@/lib/auth/errors";
import { getSession } from "@/lib/auth/session";
import { listIncidents, updateIncidentDetails } from "@/lib/incidents/service";

export const runtime = "nodejs";

const incidentUpdateSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(5000).default(""),
  postmortem: z.string().max(10000).default(""),
});

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const status = request.nextUrl.searchParams.get("status");
    const incidents = await listIncidents(
      session.id,
      status === "open" || status === "resolved" ? status : undefined
    );

    return NextResponse.json({ incidents });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load incidents right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = incidentUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid incident payload." }, { status: 400 });
    }

    const incident = await updateIncidentDetails({
      userId: session.id,
      incidentId: parsed.data.id,
      notes: parsed.data.notes,
      postmortem: parsed.data.postmortem,
    });

    if (!incident) {
      return NextResponse.json({ message: "Incident not found." }, { status: 404 });
    }

    return NextResponse.json({ incident });
  } catch (error) {
    const authError = toAuthError(error, "Unable to update incident notes right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
