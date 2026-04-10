import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { companyInputSchema } from "@/lib/companies/schemas";
import { deleteCompany, updateCompany } from "@/lib/companies/service";

export const runtime = "nodejs";

function serializeCompany(company: Awaited<ReturnType<typeof updateCompany>>) {
  if (!company) {
    return null;
  }

  return {
    ...company,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}

export async function PATCH(request: NextRequest, context: RouteContext<"/api/companies/[id]">) {
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

    const { id } = await context.params;
    const company = await updateCompany(session.id, id, parsed.data);
    if (!company) {
      return NextResponse.json({ message: "Company not found." }, { status: 404 });
    }

    return NextResponse.json({ company: serializeCompany(company) });
  } catch (error) {
    const authError = toAuthError(error, "Unable to update company right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext<"/api/companies/[id]">) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const deleted = await deleteCompany(session.id, id);
    if (!deleted) {
      return NextResponse.json({ message: "Company not found." }, { status: 404 });
    }

    return NextResponse.json({ id });
  } catch (error) {
    const authError = toAuthError(error, "Unable to delete company right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
