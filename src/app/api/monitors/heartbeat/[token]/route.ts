import { NextRequest, NextResponse } from "next/server";
import { receiveHeartbeat } from "@/lib/monitors/service";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: RouteContext<"/api/monitors/heartbeat/[token]">) {
  return handleHeartbeat(context);
}

export async function POST(_request: NextRequest, context: RouteContext<"/api/monitors/heartbeat/[token]">) {
  return handleHeartbeat(context);
}

async function handleHeartbeat(context: RouteContext<"/api/monitors/heartbeat/[token]">) {
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
