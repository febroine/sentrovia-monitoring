"use client";

import { create } from "zustand";
import type { MonitorPayload, MonitorRecord, MonitorSummary } from "@/lib/monitors/types";
import { showToast } from "@/lib/client-toast";

interface MonitoringState {
  monitors: MonitorRecord[];
  pagination: MonitorPagination;
  summary: MonitorSummary;
  loading: boolean;
  saving: boolean;
  error: string | null;
  loadMonitors: (query?: MonitorQuery) => Promise<void>;
  createMonitor: (payload: MonitorPayload) => Promise<MonitorRecord | null>;
  updateMonitor: (id: string, payload: MonitorPayload) => Promise<MonitorRecord | null>;
  updateMonitorActiveState: (id: string, isActive: boolean) => Promise<MonitorRecord | null>;
  updateMonitorFlags: (id: string, flags: { isFavorite?: boolean; isCritical?: boolean }) => Promise<MonitorRecord | null>;
  bulkUpdateMonitors: (ids: string[], payload: MonitorPayload) => Promise<MonitorRecord[]>;
  deleteMonitors: (ids: string[]) => Promise<SoftDeleteResult | null>;
  restoreMonitors: (ids: string[]) => Promise<MonitorRecord[]>;
  importMonitors: (items: MonitorRecord[]) => void;
  clearError: () => void;
}

export type MonitorQuery = {
  page: number;
  pageSize: number;
  search?: string;
  companyId?: string;
  status?: "up" | "down" | "pending";
  sort?: "createdAt" | "name" | "status" | "lastCheckedAt" | "latencyMs";
  direction?: "asc" | "desc";
};

type MonitorPagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

type SoftDeleteResult = { ids: string[]; undoUntil: string | null };

const EMPTY_MONITOR_SUMMARY: MonitorSummary = {
  total: 0,
  active: 0,
  paused: 0,
  online: 0,
  offline: 0,
  pending: 0,
};

async function readJsonOrNull<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

export const useMonitoringStore = create<MonitoringState>((set) => ({
  monitors: [],
  pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 1 },
  summary: EMPTY_MONITOR_SUMMARY,
  loading: true,
  saving: false,
  error: null,
  loadMonitors: async (query) => {
    set({ loading: true });

    try {
      const queryString = query ? `?${buildMonitorQueryString(query)}` : "";
      const response = await fetch(`/api/monitors${queryString}`, { cache: "no-store" });
      const data = await readJsonOrNull<{
        message?: string;
        monitors?: MonitorRecord[];
        pagination?: MonitorPagination;
        summary?: MonitorSummary;
      }>(response);

      if (!response.ok || !data) {
        throw new Error(data?.message ?? "Unable to load monitors.");
      }

      set((state) => ({
        monitors: data.monitors ?? [],
        pagination: data.pagination ?? {
          page: 1,
          pageSize: data.monitors?.length ?? state.pagination.pageSize,
          totalItems: data.monitors?.length ?? 0,
          totalPages: 1,
        },
        summary: data.summary ?? EMPTY_MONITOR_SUMMARY,
        loading: false,
        error: null,
      }));
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
  updateMonitorFlags: async (id, flags) => {
    set({ saving: true });

    try {
      const response = await fetch(`/api/monitors/${id}/flags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(flags),
      });
      const data = await readJsonOrNull<{ message?: string; monitor?: MonitorRecord }>(response);

      if (!response.ok || !data?.monitor) {
        throw new Error(data?.message ?? "Unable to update monitor focus flags.");
      }

      const monitor = data.monitor;
      set((state) => ({
        monitors: state.monitors.map((item) => (item.id === id ? monitor : item)),
        saving: false,
        error: null,
      }));
      showToast("Monitor focus flags updated.", "success");

      return monitor;
    } catch (error) {
      const message = getErrorMessage(error, "Unable to update monitor focus flags.");
      set({ saving: false, error: message });
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
      const data = await readJsonOrNull<{ message?: string; ids?: string[]; undoUntil?: string | null }>(response);

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

      return { ids: data.ids, undoUntil: data.undoUntil ?? null };
    } catch (error) {
      const message = getErrorMessage(error, "Unable to delete monitors.");
      set({ saving: false, error: message });
      showToast(message, "error");
      return null;
    }
  },
  restoreMonitors: async (ids) => {
    set({ saving: true });
    try {
      const response = await fetch("/api/monitors/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await readJsonOrNull<{ message?: string; monitors?: MonitorRecord[] }>(response);
      if (!response.ok || !data?.monitors) {
        throw new Error(data?.message ?? "Unable to restore monitors.");
      }
      const restoredMonitors = data.monitors;

      set((state) => ({
        monitors: [...restoredMonitors, ...state.monitors.filter((item) => !ids.includes(item.id))],
        saving: false,
        error: null,
      }));
      showToast(`${restoredMonitors.length} monitor${restoredMonitors.length === 1 ? "" : "s"} restored.`, "success");
      return restoredMonitors;
    } catch (error) {
      const message = getErrorMessage(error, "Unable to restore monitors.");
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

function buildMonitorQueryString(query: MonitorQuery) {
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    sort: query.sort ?? "createdAt",
    direction: query.direction ?? "desc",
  });

  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.companyId && query.companyId !== "all") params.set("companyId", query.companyId);
  if (query.status) params.set("status", query.status);
  return params.toString();
}
