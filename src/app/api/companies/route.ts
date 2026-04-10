import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { companyInputSchema } from "@/lib/companies/schemas";
import { createCompany, listCompanies } from "@/lib/companies/service";

export const runtime = "nodejs";

function serializeCompany(company: Awaited<ReturnType<typeof listCompanies>>[number]) {
  return {
    ...company,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const companies = await listCompanies(session.id);
    return NextResponse.json({ companies: companies.map(serializeCompany) });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load companies right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = companyInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid company payload." }, { status: 400 });
    }

    const company = await createCompany(session.id, parsed.data);
    return NextResponse.json({ company: serializeCompany(company) }, { status: 201 });
  } catch (error) {
    const authError = toAuthError(error, "Unable to create company right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
