import { NextRequest, NextResponse } from "next/server";
import { receiveHeartbeat } from "@/lib/monitors/service";

export const runtime = "nodejs";

type HeartbeatRouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: NextRequest, context: HeartbeatRouteContext) {
  return handleHeartbeat(context);
}

export async function POST(_request: NextRequest, context: HeartbeatRouteContext) {
  return handleHeartbeat(context);
}

async function handleHeartbeat(context: HeartbeatRouteContext) {
  const { token } = await context.params;
  const receipt = await receiveHeartbeat(token);

  if (!receipt) {
    return NextResponse.json({ message: "Heartbeat monitor not found." }, { status: 404 });
  }

  return NextResponse.json(
    {
      message: receipt.paused ? "Heartbeat monitor is paused." : "Heartbeat received.",
      monitorId: receipt.monitor.id,
      accepted: receipt.accepted,
      receivedAt: receipt.receivedAt.toISOString(),
    },
    { status: receipt.paused ? 202 : 200 }
  );
}
