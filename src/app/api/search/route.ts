import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { searchWorkspace } from "@/lib/search/service";
import { toAuthError } from "@/lib/auth/errors";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (query.length < 2) return NextResponse.json({ results: [] });
    const results = await searchWorkspace(session.activeWorkspaceId!, session.id, session.role, query);
    return NextResponse.json({ results });
  } catch (error) {
    const authError = toAuthError(error, "Unable to search right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
