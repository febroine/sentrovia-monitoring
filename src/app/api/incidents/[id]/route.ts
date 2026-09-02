import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse, parseJsonRequest, requireMutationPermission } from "@/lib/http/api-route";
import { incidentUpdateSchema } from "@/lib/incidents/schemas";
import { updateIncident } from "@/lib/incidents/service";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) { try { const session = await requireMutationPermission(request, "incidents.manage"); const input = await parseJsonRequest(request, incidentUpdateSchema, "Invalid incident update."); const { id } = await context.params; return NextResponse.json({ incident: await updateIncident(session.activeWorkspaceId!, session.id, id, input) }); } catch (error) { return apiErrorResponse(error, "Unable to update incident."); } }
