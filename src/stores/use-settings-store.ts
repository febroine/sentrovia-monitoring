"use client";

import { create } from "zustand";
import { DEFAULT_SETTINGS, type SettingsPayload } from "@/lib/settings/types";

export const SIDEBAR_ACCENT_UPDATED_EVENT = "sentrovia:sidebar-accent-updated";
export const APPEARANCE_SETTINGS_UPDATED_EVENT = "sentrovia:appearance-updated";

interface SettingsState {
  settings: SettingsPayload;
  loading: boolean;
  saving: boolean;
  error: string | null;
  message: string | null;
  loadSettings: () => Promise<void>;
  saveSettings: () => Promise<void>;
  updateSetting: (
    path: string,
    value: string | number | boolean | string[]
  ) => void;
  clearMessage: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loading: true,
  saving: false,
  error: null,
  message: null,
  loadSettings: async () => {
    set({ loading: true });

    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const data = (await response.json()) as { message?: string; settings?: SettingsPayload | null };

      if (!response.ok || !data.settings) {
        throw new Error(data.message ?? "Unable to load settings.");
      }

      set({ settings: data.settings, loading: false, error: null, message: null });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Unable to load settings.",
      });
    }
  },
  saveSettings: async () => {
    set({ saving: true, message: null });

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(get().settings),
      });
      const data = (await response.json()) as { message?: string; settings?: SettingsPayload | null };

      if (!response.ok || !data.settings) {
        throw new Error(data.message ?? "Unable to save settings.");
      }

      set({
        settings: data.settings,
        saving: false,
        error: null,
        message: "Settings saved.",
      });

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent(APPEARANCE_SETTINGS_UPDATED_EVENT, {
            detail: {
              appearance: data.settings.appearance,
            },
          })
        );
        window.dispatchEvent(
          new CustomEvent(SIDEBAR_ACCENT_UPDATED_EVENT, {
            detail: {
              accent: data.settings.appearance.sidebarAccent,
            },
          })
        );
      }
    } catch (error) {
      set({
        saving: false,
        error: error instanceof Error ? error.message : "Unable to save settings.",
      });
    }
  },
  updateSetting: (path, value) =>
    set((state) => {
      const next = structuredClone(state.settings);
      const [section, key] = path.split(".") as [keyof SettingsPayload, string | undefined];

      if (!key) {
        (next as unknown as Record<string, unknown>)[section] = value;
        return { settings: next, message: null };
      }

      (next[section] as Record<string, string | number | boolean | string[]>)[key] = value;
      return { settings: next, message: null };
    }),
  clearMessage: () => set({ message: null, error: null }),
}));
