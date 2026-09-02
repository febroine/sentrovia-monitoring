import { NextRequest, NextResponse } from "next/server";
import { companyBulkActionSchema } from "@/lib/companies/schemas";
import { restoreCompanies } from "@/lib/companies/service";
import { apiErrorResponse, parseJsonRequest, requireMutationPermission } from "@/lib/http/api-route";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await requireMutationPermission(request, "companies.manage");
    const input = await parseJsonRequest(
      request,
      companyBulkActionSchema.pick({ ids: true }),
      "Select at least one company to restore."
    );
    const companies = await restoreCompanies({
      workspaceId: session.activeWorkspaceId!,
      userId: session.id,
    }, input.ids);
    if (companies.length === 0) {
      return NextResponse.json({ message: "The company restore window has expired." }, { status: 409 });
    }
    return NextResponse.json({ ids: companies.map((company) => company.id) });
  } catch (error) {
    return apiErrorResponse(error, "Unable to restore companies right now.");
  }
}
