import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/authorization";
import { apiErrorResponse, parseJsonRequest, requireMutationPermission } from "@/lib/http/api-route";
import { maintenanceWindowSchema } from "@/lib/maintenance/schemas";
import { createMaintenanceWindow, listMaintenanceWindows } from "@/lib/maintenance/service";

export async function GET() { try { const session = await requireSession(); return NextResponse.json({ windows: await listMaintenanceWindows(session.activeWorkspaceId!) }); } catch (error) { return apiErrorResponse(error, "Unable to load maintenance windows."); } }
export async function POST(request: NextRequest) { try { const session = await requireMutationPermission(request, "maintenance.manage"); const input = await parseJsonRequest(request, maintenanceWindowSchema, "Invalid maintenance window."); return NextResponse.json({ window: await createMaintenanceWindow(session.activeWorkspaceId!, session.id, input) }, { status: 201 }); } catch (error) { return apiErrorResponse(error, "Unable to schedule maintenance."); } }
