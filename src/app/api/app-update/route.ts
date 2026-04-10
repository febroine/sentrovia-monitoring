import { NextResponse } from "next/server";
import { applyAvailableUpdate, getUpdateStatus } from "@/lib/app-update/service";

export async function GET() {
  const status = await getUpdateStatus();
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  try {
    const result = await applyAvailableUpdate();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        updated: false,
        restartRequired: false,
        message: error instanceof Error ? error.message : "Unable to apply the update automatically.",
      },
      { status: 409 }
    );
  }
}
