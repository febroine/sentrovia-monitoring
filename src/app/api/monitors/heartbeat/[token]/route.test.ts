import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/monitors/heartbeat/[token]/route";
import { receiveHeartbeat } from "@/lib/monitors/service";

vi.mock("@/lib/monitors/service", () => ({
  receiveHeartbeat: vi.fn(),
}));

describe("heartbeat route", () => {
  it("does not accept heartbeat state changes over GET", async () => {
    const response = await GET();
    const body = await response.json() as { message: string };

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(body.message).toBe("Heartbeat endpoints require POST requests.");
    expect(receiveHeartbeat).not.toHaveBeenCalled();
  });

  it("accepts heartbeat state changes over POST", async () => {
    vi.mocked(receiveHeartbeat).mockResolvedValueOnce({
      accepted: true,
      paused: false,
      monitor: {} as Awaited<ReturnType<typeof receiveHeartbeat>> extends infer Receipt
        ? Receipt extends { monitor: infer Monitor }
          ? Monitor
          : never
        : never,
      receivedAt: new Date("2026-06-01T12:00:00.000Z"),
    });

    const response = await POST(new Request("https://example.com", { method: "POST" }) as never, buildContext("secret-token"));
    const body = await response.json() as { accepted: boolean; receivedAt: string };

    expect(response.status).toBe(200);
    expect(body.accepted).toBe(true);
    expect(body.receivedAt).toBe("2026-06-01T12:00:00.000Z");
    expect(receiveHeartbeat).toHaveBeenCalledWith("secret-token");
  });
});

function buildContext(token: string) {
  return {
    params: Promise.resolve({ token }),
  };
}
