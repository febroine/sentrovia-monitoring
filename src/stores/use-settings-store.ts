"use client";

import { create } from "zustand";
import {
  buildSectionSavePayload,
  mergeSavedSection,
  type SettingsSaveSection,
} from "@/lib/settings/section-save";
import { DEFAULT_SETTINGS, type SettingsPayload } from "@/lib/settings/types";
import { showToast } from "@/lib/client-toast";

export const SIDEBAR_ACCENT_UPDATED_EVENT = "sentrovia:sidebar-accent-updated";
export const APPEARANCE_SETTINGS_UPDATED_EVENT = "sentrovia:appearance-updated";

interface SettingsState {
  settings: SettingsPayload;
  persistedSettings: SettingsPayload;
  loading: boolean;
  saving: boolean;
  error: string | null;
  message: string | null;
  loadSettings: () => Promise<void>;
  saveSettings: (section?: SettingsSaveSection) => Promise<void>;
  updateSetting: (
    path: string,
    value: string | number | boolean | string[]
  ) => void;
  clearMessage: () => void;
}

async function readJsonOrNull<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  persistedSettings: DEFAULT_SETTINGS,
  loading: true,
  saving: false,
  error: null,
  message: null,
  loadSettings: async () => {
    set({ loading: true });

    try {
      const response = await fetch("/api/settings", { cache: "no-store" });
      const data = await readJsonOrNull<{ message?: string; settings?: SettingsPayload | null }>(response);

      if (!response.ok || !data?.settings) {
        throw new Error(data?.message ?? "Unable to load settings.");
      }

      set({
        settings: data.settings,
        persistedSettings: structuredClone(data.settings),
        loading: false,
        error: null,
        message: null,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Unable to load settings.",
      });
    }
  },
  saveSettings: async (section = "all") => {
    if (get().saving) {
      return;
    }

    set({ saving: true, message: null });

    try {
      const state = get();
      const payload = buildSectionSavePayload(state.persistedSettings, state.settings, section);
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJsonOrNull<{ message?: string; settings?: SettingsPayload | null }>(response);

      if (!response.ok || !data?.settings) {
        throw new Error(data?.message ?? "Unable to save settings.");
      }

      const mergedSettings = mergeSavedSection(get().settings, data.settings, section, state.persistedSettings);
      set({
        settings: mergedSettings,
        persistedSettings: structuredClone(data.settings),
        saving: false,
        error: null,
        message: "Settings saved.",
      });
      showToast("Settings saved.", "success");

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
      const message = error instanceof Error ? error.message : "Unable to save settings.";
      set({
        saving: false,
        error: message,
      });
      showToast(message, "error");
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
