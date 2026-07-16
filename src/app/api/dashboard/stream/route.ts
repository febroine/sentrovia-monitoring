import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getActiveSessionUser } from "@/lib/auth/service";
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
  let frameInProgress = false;
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
        if (closed || frameInProgress) {
          return;
        }

        frameInProgress = true;
        try {
          const activeSession = await getActiveSessionUser(session.id, session.sessionVersion);
          if (!activeSession) {
            cleanup();
            controller.close();
            return;
          }

          const payload = await getDashboardData(activeSession.id);
          if (closed) {
            return;
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } finally {
          frameInProgress = false;
        }
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
      if (request.signal.aborted) {
        cleanup();
        return;
      }

      await sendFrame();
      if (closed) {
        return;
      }

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
