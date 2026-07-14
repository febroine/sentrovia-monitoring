"use client";

import { create } from "zustand";
import type { MonitorPayload, MonitorRecord } from "@/lib/monitors/types";
import { showToast } from "@/lib/client-toast";

interface MonitoringState {
  monitors: MonitorRecord[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  loadMonitors: () => Promise<void>;
  createMonitor: (payload: MonitorPayload) => Promise<MonitorRecord | null>;
  updateMonitor: (id: string, payload: MonitorPayload) => Promise<MonitorRecord | null>;
  updateMonitorActiveState: (id: string, isActive: boolean) => Promise<MonitorRecord | null>;
  bulkUpdateMonitors: (ids: string[], payload: MonitorPayload) => Promise<MonitorRecord[]>;
  deleteMonitors: (ids: string[]) => Promise<string[]>;
  importMonitors: (items: MonitorRecord[]) => void;
  clearError: () => void;
}

async function readJsonOrNull<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

export const useMonitoringStore = create<MonitoringState>((set) => ({
  monitors: [],
  loading: true,
  saving: false,
  error: null,
  loadMonitors: async () => {
    set({ loading: true });

    try {
      const response = await fetch("/api/monitors", { cache: "no-store" });
      const data = await readJsonOrNull<{ message?: string; monitors?: MonitorRecord[] }>(response);

      if (!response.ok || !data) {
        throw new Error(data?.message ?? "Unable to load monitors.");
      }

      set({ monitors: data.monitors ?? [], loading: false, error: null });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Unable to load monitors.",
      });
    }
  },
  createMonitor: async (payload) => {
    set({ saving: true });

    try {
      const response = await fetch("/api/monitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJsonOrNull<{ message?: string; monitor?: MonitorRecord }>(response);

      if (!response.ok || !data?.monitor) {
        throw new Error(data?.message ?? "Unable to create monitor.");
      }

      const monitor = data.monitor;
      set((state) => ({
        monitors: [monitor, ...state.monitors],
        saving: false,
        error: null,
      }));
      showToast("Monitor created.", "success");

      return monitor;
    } catch (error) {
      const message = getErrorMessage(error, "Unable to create monitor.");
      set({ saving: false, error: message });
      showToast(message, "error");
      return null;
    }
  },
  updateMonitor: async (id, payload) => {
    set({ saving: true });

    try {
      const response = await fetch(`/api/monitors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJsonOrNull<{ message?: string; monitor?: MonitorRecord }>(response);

      if (!response.ok || !data?.monitor) {
        throw new Error(data?.message ?? "Unable to update monitor.");
      }

      const monitor = data.monitor;
      set((state) => ({
        monitors: state.monitors.map((item) => (item.id === id ? monitor : item)),
        saving: false,
        error: null,
      }));
      showToast("Monitor updated.", "success");

      return monitor;
    } catch (error) {
      const message = getErrorMessage(error, "Unable to update monitor.");
      set({ saving: false, error: message });
      showToast(message, "error");
      return null;
    }
  },
  updateMonitorActiveState: async (id, isActive) => {
    set({ saving: true });

    try {
      const response = await fetch(`/api/monitors/${id}/active`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const data = await readJsonOrNull<{ message?: string; monitor?: MonitorRecord }>(response);

      if (!response.ok || !data?.monitor) {
        throw new Error(data?.message ?? "Unable to update monitor active state.");
      }

      const monitor = data.monitor;
      set((state) => ({
        monitors: state.monitors.map((item) => (item.id === id ? monitor : item)),
        saving: false,
        error: null,
      }));
      showToast(isActive ? "Monitor enabled." : "Monitor paused.", "success");

      return monitor;
    } catch (error) {
      const message = getErrorMessage(error, "Unable to update monitor active state.");
      set({
        saving: false,
        error: message,
      });
      showToast(message, "error");
      return null;
    }
  },
  bulkUpdateMonitors: async (ids, payload) => {
    set({ saving: true });

    try {
      const response = await fetch("/api/monitors/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, payload }),
      });
      const data = await readJsonOrNull<{ message?: string; monitors?: MonitorRecord[] }>(response);

      if (!response.ok || !data?.monitors) {
        throw new Error(data?.message ?? "Unable to update selected monitors.");
      }

      const updatedMap = new Map(data.monitors.map((monitor) => [monitor.id, monitor]));
      set((state) => ({
        monitors: state.monitors.map((item) => updatedMap.get(item.id) ?? item),
        saving: false,
        error: null,
      }));
      showToast(`${data.monitors.length} monitor${data.monitors.length === 1 ? "" : "s"} updated.`, "success");

      return data.monitors;
    } catch (error) {
      const message = getErrorMessage(error, "Unable to update selected monitors.");
      set({
        saving: false,
        error: message,
      });
      showToast(message, "error");
      return [];
    }
  },
  deleteMonitors: async (ids) => {
    set({ saving: true });

    try {
      const response = await fetch("/api/monitors", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await readJsonOrNull<{ message?: string; ids?: string[] }>(response);

      if (!response.ok || !data?.ids) {
        throw new Error(data?.message ?? "Unable to delete monitors.");
      }

      const deletedIds = new Set(data.ids);
      set((state) => ({
        monitors: state.monitors.filter((monitor) => !deletedIds.has(monitor.id)),
        saving: false,
        error: null,
      }));
      showToast(`${data.ids.length} monitor${data.ids.length === 1 ? "" : "s"} deleted.`, "success");

      return data.ids;
    } catch (error) {
      const message = getErrorMessage(error, "Unable to delete monitors.");
      set({ saving: false, error: message });
      showToast(message, "error");
      return [];
    }
  },
  importMonitors: (items) =>
    set((state) => ({
      monitors: [...items, ...state.monitors],
      error: null,
    })),
  clearError: () => set({ error: null }),
}));

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
