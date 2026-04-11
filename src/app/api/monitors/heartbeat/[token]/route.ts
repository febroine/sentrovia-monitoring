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
  const monitor = await receiveHeartbeat(token);

  if (!monitor) {
    return NextResponse.json({ message: "Heartbeat monitor not found." }, { status: 404 });
  }

  return NextResponse.json({
    message: "Heartbeat received.",
    monitorId: monitor.id,
    receivedAt: new Date().toISOString(),
  });
}
