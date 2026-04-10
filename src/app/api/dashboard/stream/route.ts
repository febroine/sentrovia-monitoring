import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/dashboard/service";

export const runtime = "nodejs";

const STREAM_INTERVAL_MS = 15_000;

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendFrame = async () => {
        const payload = await getDashboardData(session.id);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      await sendFrame();
      const interval = setInterval(() => {
        void sendFrame().catch((error) => {
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ message: error instanceof Error ? error.message : "Dashboard stream failed." })}\n\n`)
          );
        });
      }, STREAM_INTERVAL_MS);
      request.signal.addEventListener("abort", () => clearInterval(interval));
    },
    cancel() {
      return undefined;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
