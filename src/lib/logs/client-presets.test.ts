import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogPreset, deleteLogPreset, loadLogPresets } from "@/lib/logs/client-presets";
import type { LogFilters, LogPresetRecord } from "@/lib/logs/types";

const filters: LogFilters = {
  search: "timeout",
  level: "all",
  companyQuery: "",
  monitorQuery: "",
  from: "",
  to: "",
  statusCode: "",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("log preset client requests", () => {
  it("returns presets from a successful response", async () => {
    const preset = { id: "preset-1", name: "Timeouts" } as LogPresetRecord;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ presets: [preset] })));

    await expect(loadLogPresets()).resolves.toEqual([preset]);
  });

  it("preserves an API error message when saving fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
      { message: "A preset with this name already exists." },
      { status: 409 }
    )));

    await expect(createLogPreset("Timeouts", filters)).rejects.toThrow("A preset with this name already exists.");
  });

  it("uses an actionable fallback for a malformed error response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Service unavailable", { status: 503 })));

    await expect(deleteLogPreset("preset/1")).rejects.toThrow("Unable to delete the preset.");
    expect(fetch).toHaveBeenCalledWith("/api/logs/presets?id=preset%2F1", { method: "DELETE" });
  });

  it("propagates a rejected network request for the page error boundary", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    await expect(loadLogPresets()).rejects.toThrow("network unavailable");
  });
});
