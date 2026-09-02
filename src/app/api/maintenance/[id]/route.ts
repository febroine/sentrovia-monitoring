import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, requireMutationPermission } from "@/lib/http/api-route";
import { cancelMaintenanceWindow } from "@/lib/maintenance/service";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { const session = await requireMutationPermission(request, "maintenance.manage"); const { id } = await context.params; const window = await cancelMaintenanceWindow(session.activeWorkspaceId!, id); return window ? NextResponse.json({ window }) : NextResponse.json({ message: "Maintenance window not found." }, { status: 404 }); } catch (error) { return apiErrorResponse(error, "Unable to cancel maintenance."); } }
