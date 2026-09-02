import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/authorization";
import { apiErrorResponse } from "@/lib/http/api-route";
import { listIncidents } from "@/lib/incidents/service";

export async function GET() { try { const session = await requireSession(); return NextResponse.json(await listIncidents(session.activeWorkspaceId!)); } catch (error) { return apiErrorResponse(error, "Unable to load incidents."); } }
