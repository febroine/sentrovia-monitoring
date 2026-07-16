import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { companyBulkActionSchema } from "@/lib/companies/schemas";
import { restoreCompanies } from "@/lib/companies/service";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES);
    const parsed = companyBulkActionSchema.pick({ ids: true }).safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: "Select at least one company to restore." }, { status: 400 });
    }

    const companies = await restoreCompanies(session.id, parsed.data.ids);
    if (companies.length === 0) {
      return NextResponse.json({ message: "The company restore window has expired." }, { status: 409 });
    }
    return NextResponse.json({ ids: companies.map((company) => company.id) });
  } catch (error) {
    const authError = toAuthError(error, "Unable to restore companies right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
