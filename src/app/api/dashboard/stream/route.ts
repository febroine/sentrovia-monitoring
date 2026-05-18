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
  let closed = false;
  let interval: ReturnType<typeof setInterval> | null = null;

  function cleanup() {
    closed = true;
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    request.signal.removeEventListener("abort", cleanup);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const sendFrame = async () => {
        if (closed) {
          return;
        }

        const payload = await getDashboardData(session.id);
        if (closed) {
          return;
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
      if (request.signal.aborted) {
        cleanup();
        return;
      }

      await sendFrame();
      interval = setInterval(() => {
        void sendFrame().catch((error) => {
          if (closed) {
            return;
          }

          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ message: error instanceof Error ? error.message : "Dashboard stream failed." })}\n\n`)
          );
        });
      }, STREAM_INTERVAL_MS);
    },
    cancel() {
      cleanup();
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
