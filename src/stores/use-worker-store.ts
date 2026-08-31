"use client";

import { create } from "zustand";
import type { WorkerObservabilityRange, WorkerStatus } from "@/lib/monitors/types";

interface WorkerStore {
  worker: WorkerStatus | null;
  loading: boolean;
  commandLoading: boolean;
  error: string | null;
  loadWorker: (range?: WorkerObservabilityRange) => Promise<void>;
  toggleWorker: () => Promise<void>;
}

let workerRequestVersion = 0;

export const useWorkerStore = create<WorkerStore>((set, get) => ({
  worker: null,
  loading: true,
  commandLoading: false,
  error: null,
  loadWorker: async (range = "24h") => {
    if (get().commandLoading) {
      return;
    }
    const requestVersion = ++workerRequestVersion;

    try {
      const response = await fetch(`/api/worker?range=${range}`, { cache: "no-store" });
      const data = await readJsonOrNull<{ message?: string } & WorkerStatus>(response);

      if (!response.ok || !data) {
        throw new Error(data?.message ?? "Unable to load worker state.");
      }
      if (requestVersion !== workerRequestVersion) {
        return;
      }

      set({ worker: data, loading: false, error: null });
    } catch (error) {
      if (requestVersion !== workerRequestVersion) {
        return;
      }
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

    const requestVersion = ++workerRequestVersion;
    set({ commandLoading: true });

    try {
      const response = await fetch("/api/worker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: getNextWorkerAction(current) }),
      });
      const data = await readJsonOrNull<{ message?: string } & WorkerStatus>(response);

      if (!response.ok || !data) {
        throw new Error(data?.message ?? "Unable to update worker state.");
      }
      if (requestVersion !== workerRequestVersion) {
        return;
      }

      set({ worker: data, commandLoading: false, error: null });
    } catch (error) {
      if (requestVersion !== workerRequestVersion) {
        return;
      }
      set({
        commandLoading: false,
        error: error instanceof Error ? error.message : "Unable to update worker state.",
      });
    }
  },
}));

async function readJsonOrNull<T>(response: Response) {
  return (await response.json().catch(() => null)) as T | null;
}

function getNextWorkerAction(worker: WorkerStatus): "start" | "stop" {
  if (worker.desiredState !== "running") {
    return "start";
  }

  return worker.running || worker.processAlive ? "stop" : "start";
}
