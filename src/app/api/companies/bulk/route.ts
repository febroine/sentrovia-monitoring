import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { companyBulkActionSchema } from "@/lib/companies/schemas";
import { deleteCompanies, listCompanies, updateCompaniesActiveState } from "@/lib/companies/service";

export const runtime = "nodejs";

function serializeCompany(company: Awaited<ReturnType<typeof listCompanies>>[number]) {
  return {
    ...company,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = companyBulkActionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ message: "Invalid bulk company payload." }, { status: 400 });
    }

    if (parsed.data.action === "delete") {
      const deletedIds = await deleteCompanies(session.id, parsed.data.ids);
      return NextResponse.json({ ids: deletedIds });
    }

    const companies = await updateCompaniesActiveState(
      session.id,
      parsed.data.ids,
      parsed.data.action === "activate"
    );

    return NextResponse.json({ companies: companies.map(serializeCompany) });
  } catch (error) {
    const authError = toAuthError(error, "Unable to process bulk company action right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
