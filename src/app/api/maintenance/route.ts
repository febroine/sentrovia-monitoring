import { NextRequest, NextResponse } from "next/server";
import { toAuthError } from "@/lib/auth/errors";
import { getSession } from "@/lib/auth/session";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import { maintenanceWindowInputSchema } from "@/lib/maintenance/schemas";
import { createMaintenanceWindow, listMaintenanceWindows } from "@/lib/maintenance/service";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ windows: await listMaintenanceWindows(session.id) });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load maintenance windows right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const parsed = maintenanceWindowInputSchema.safeParse(await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES));
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid maintenance window." }, { status: 400 });
    }

    const window = await createMaintenanceWindow(session.id, parsed.data);
    return NextResponse.json({ window }, { status: 201 });
  } catch (error) {
    const authError = toAuthError(error, "Unable to create the maintenance window right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
