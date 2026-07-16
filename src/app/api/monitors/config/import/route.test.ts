import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/monitors/config/import/route";
import { getSession } from "@/lib/auth/session";
import { parseMonitorConfigBundle, previewMonitorConfigImport } from "@/lib/monitors/config-service";
import { createManyMonitors } from "@/lib/monitors/service";
import { DEFAULT_MONITOR_FORM } from "@/lib/monitors/types";
import { getSettings } from "@/lib/settings/service";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/monitors/config-service", () => ({
  parseMonitorConfigBundle: vi.fn(),
  previewMonitorConfigImport: vi.fn(),
}));
vi.mock("@/lib/monitors/service", () => ({ createManyMonitors: vi.fn() }));
vi.mock("@/lib/settings/service", () => ({ getSettings: vi.fn() }));

describe("monitor config import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue({ id: "user-1" } as never);
    vi.mocked(getSettings).mockResolvedValue(DEFAULT_SETTINGS);
    vi.mocked(createManyMonitors).mockResolvedValue([]);
  });

  it("reports invalid records without hiding valid import candidates", async () => {
    vi.mocked(parseMonitorConfigBundle).mockReturnValue({
      monitors: [
        { ...DEFAULT_MONITOR_FORM, name: "Invalid", url: "not-a-url" },
        { ...DEFAULT_MONITOR_FORM, name: "Valid", url: "https://valid.example.com" },
      ],
    } as never);
    vi.mocked(previewMonitorConfigImport).mockResolvedValue({
      items: [{ index: 1, name: "Valid", target: "https://valid.example.com/", status: "added", reason: null }],
      summary: { added: 1, skipped: 0, invalid: 0 },
    });

    const response = await POST(createRequest("preview"));
    const body = (await response.json()) as {
      preview: { items: Array<{ index: number; status: string }>; summary: { invalid: number } };
    };

    expect(response.status).toBe(200);
    expect(body.preview.summary.invalid).toBe(1);
    expect(body.preview.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ index: 1, status: "invalid" }),
      expect.objectContaining({ index: 2, status: "added" }),
    ]));
  });

  it("applies only records marked as added by the preview", async () => {
    vi.mocked(parseMonitorConfigBundle).mockReturnValue({
      monitors: [
        { ...DEFAULT_MONITOR_FORM, name: "Existing", url: "https://existing.example.com" },
        { ...DEFAULT_MONITOR_FORM, name: "New", url: "https://new.example.com" },
      ],
    } as never);
    vi.mocked(previewMonitorConfigImport).mockResolvedValue({
      items: [
        { index: 1, name: "Existing", target: "https://existing.example.com/", status: "skipped", reason: "Duplicate" },
        { index: 2, name: "New", target: "https://new.example.com/", status: "added", reason: null },
      ],
      summary: { added: 1, skipped: 1, invalid: 0 },
    });

    const response = await POST(createRequest("apply"));

    expect(response.status).toBe(200);
    expect(createManyMonitors).toHaveBeenCalledWith(
      "user-1",
      [expect.objectContaining({ name: "New", url: "https://new.example.com" })]
    );
  });
});

function createRequest(mode: "preview" | "apply") {
  return new NextRequest("http://localhost/api/monitors/config/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format: "json", content: "{}", mode }),
  });
}
