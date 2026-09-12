import type { LogFilters, LogPresetRecord } from "@/lib/logs/types";

type LogPresetResponse = {
  message?: string;
  presets?: LogPresetRecord[];
};

export async function loadLogPresets() {
  return requestLogPresets("/api/logs/presets", { cache: "no-store" }, "Unable to load log presets.");
}

export async function createLogPreset(name: string, filters: LogFilters) {
  return requestLogPresets("/api/logs/presets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, filters }),
  }, "Unable to save the preset.");
}

export async function deleteLogPreset(presetId: string) {
  return requestLogPresets(
    `/api/logs/presets?id=${encodeURIComponent(presetId)}`,
    { method: "DELETE" },
    "Unable to delete the preset."
  );
}

async function requestLogPresets(
  input: string,
  init: RequestInit,
  fallbackMessage: string
) {
  const response = await fetch(input, init);
  const data = (await response.json().catch(() => null)) as LogPresetResponse | null;

  if (!response.ok || !data?.presets) {
    throw new Error(data?.message ?? fallbackMessage);
  }

  return data.presets;
}
