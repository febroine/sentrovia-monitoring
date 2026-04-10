"use client";

import { create } from "zustand";
import type { WorkerStatus } from "@/lib/monitors/types";

interface WorkerStore {
  worker: WorkerStatus | null;
  loading: boolean;
  commandLoading: boolean;
  error: string | null;
  loadWorker: () => Promise<void>;
  toggleWorker: () => Promise<void>;
}

export const useWorkerStore = create<WorkerStore>((set, get) => ({
  worker: null,
  loading: true,
  commandLoading: false,
  error: null,
  loadWorker: async () => {
    try {
      const response = await fetch("/api/worker", { cache: "no-store" });
      const data = (await response.json()) as { message?: string } & WorkerStatus;

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to load worker state.");
      }

      set({ worker: data, loading: false, error: null });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : "Unable to load worker state.",
      });
    }
  },
  toggleWorker: async () => {
    const current = get().worker;
    if (!current) {
      return;
    }

    set({ commandLoading: true });

    try {
      const response = await fetch("/api/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: current.desiredState === "running" ? "stop" : "start" }),
      });
      const data = (await response.json()) as { message?: string } & WorkerStatus;

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to update worker state.");
      }

      set({ worker: data, commandLoading: false, error: null });
    } catch (error) {
      set({
        commandLoading: false,
        error: error instanceof Error ? error.message : "Unable to update worker state.",
      });
    }
  },
}));
