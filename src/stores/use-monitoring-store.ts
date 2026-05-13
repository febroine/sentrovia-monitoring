"use client";

import { create } from "zustand";
import type { MonitorPayload, MonitorRecord } from "@/lib/monitors/types";

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

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
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
      const data = await readJson<{ message?: string; monitors?: MonitorRecord[] }>(response);

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to load monitors.");
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
      const data = await readJson<{ message?: string; monitor?: MonitorRecord }>(response);

      if (!response.ok || !data.monitor) {
        throw new Error(data.message ?? "Unable to create monitor.");
      }

      const monitor = data.monitor;
      set((state) => ({
        monitors: [monitor, ...state.monitors],
        saving: false,
        error: null,
      }));

      return monitor;
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : "Unable to create monitor." });
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
      const data = await readJson<{ message?: string; monitor?: MonitorRecord }>(response);

      if (!response.ok || !data.monitor) {
        throw new Error(data.message ?? "Unable to update monitor.");
      }

      const monitor = data.monitor;
      set((state) => ({
        monitors: state.monitors.map((item) => (item.id === id ? monitor : item)),
        saving: false,
        error: null,
      }));

      return monitor;
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : "Unable to update monitor." });
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
      const data = await readJson<{ message?: string; monitor?: MonitorRecord }>(response);

      if (!response.ok || !data.monitor) {
        throw new Error(data.message ?? "Unable to update monitor active state.");
      }

      const monitor = data.monitor;
      set((state) => ({
        monitors: state.monitors.map((item) => (item.id === id ? monitor : item)),
        saving: false,
        error: null,
      }));

      return monitor;
    } catch (error) {
      set({
        saving: false,
        error: error instanceof Error ? error.message : "Unable to update monitor active state.",
      });
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
      const data = await readJson<{ message?: string; monitors?: MonitorRecord[] }>(response);

      if (!response.ok || !data.monitors) {
        throw new Error(data.message ?? "Unable to update selected monitors.");
      }

      const updatedMap = new Map(data.monitors.map((monitor) => [monitor.id, monitor]));
      set((state) => ({
        monitors: state.monitors.map((item) => updatedMap.get(item.id) ?? item),
        saving: false,
        error: null,
      }));

      return data.monitors;
    } catch (error) {
      set({
        saving: false,
        error: error instanceof Error ? error.message : "Unable to update selected monitors.",
      });
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
      const data = await readJson<{ message?: string; ids?: string[] }>(response);

      if (!response.ok || !data.ids) {
        throw new Error(data.message ?? "Unable to delete monitors.");
      }

      const deletedIds = new Set(data.ids);
      set((state) => ({
        monitors: state.monitors.filter((monitor) => !deletedIds.has(monitor.id)),
        saving: false,
        error: null,
      }));

      return data.ids;
    } catch (error) {
      set({ saving: false, error: error instanceof Error ? error.message : "Unable to delete monitors." });
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
