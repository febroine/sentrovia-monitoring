import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { deleteLogFilterPreset, listLogFilterPresets, upsertLogFilterPreset } from "@/lib/logs/preset-service";

export const runtime = "nodejs";

const presetSchema = z.object({
  name: z.string().trim().min(1).max(120),
  filters: z.object({
    search: z.string(),
    level: z.string(),
    companyQuery: z.string(),
    monitorQuery: z.string(),
    from: z.string(),
    to: z.string(),
    statusCode: z.string(),
  }),
});

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const presets = await listLogFilterPresets(session.id);
    return NextResponse.json({ presets });
  } catch (error) {
    const authError = toAuthError(error, "Unable to load log presets right now.");
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
    const parsed = presetSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: "Invalid log preset payload." }, { status: 400 });
    }

    await upsertLogFilterPreset(session.id, parsed.data);
    const presets = await listLogFilterPresets(session.id);
    return NextResponse.json({ presets });
  } catch (error) {
    const authError = toAuthError(error, "Unable to save the log preset right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const presetId = searchParams.get("id");
    if (!presetId) {
      return NextResponse.json({ message: "Preset id is required." }, { status: 400 });
    }

    await deleteLogFilterPreset(session.id, presetId);
    const presets = await listLogFilterPresets(session.id);
    return NextResponse.json({ presets });
  } catch (error) {
    const authError = toAuthError(error, "Unable to delete the log preset right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
