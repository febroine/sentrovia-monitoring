import { NextRequest, NextResponse } from "next/server";
import { toAuthError } from "@/lib/auth/errors";
import { getSession } from "@/lib/auth/session";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import { maintenanceWindowInputSchema } from "@/lib/maintenance/schemas";
import { deleteMaintenanceWindow, updateMaintenanceWindow } from "@/lib/maintenance/service";

type Params = Promise<{ id: string }>;

export async function PATCH(request: NextRequest, context: { params: Params }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const parsed = maintenanceWindowInputSchema.safeParse(await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES));
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid maintenance window." }, { status: 400 });
    }

    const { id } = await context.params;
    const window = await updateMaintenanceWindow(session.id, id, parsed.data);
    if (!window) {
      return NextResponse.json({ message: "Maintenance window not found." }, { status: 404 });
    }

    return NextResponse.json({ window });
  } catch (error) {
    const authError = toAuthError(error, "Unable to update the maintenance window right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function DELETE(_request: NextRequest, context: { params: Params }) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const deleted = await deleteMaintenanceWindow(session.id, id);
    if (!deleted) {
      return NextResponse.json({ message: "Maintenance window not found." }, { status: 404 });
    }

    return NextResponse.json({ id: deleted.id });
  } catch (error) {
    const authError = toAuthError(error, "Unable to delete the maintenance window right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
