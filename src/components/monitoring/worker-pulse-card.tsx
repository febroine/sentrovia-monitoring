"use client";

import { useEffect, useState } from "react";
import { Activity, ChevronDown, Play, Square, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkerStore } from "@/stores/use-worker-store";
import { sanitizeWorkerStatusMessage } from "@/lib/worker/status-message";

export function WorkerPulseCard() {
  const { worker, commandLoading, error, loadWorker, toggleWorker } = useWorkerStore();
  const [now, setNow] = useState(() => Date.now());
  const heartbeatAge = worker?.heartbeatAt ? Math.max(0, Math.floor((now - new Date(worker.heartbeatAt).getTime()) / 1000)) : null;
  const stale = worker?.desiredState === "running" && (heartbeatAge === null || heartbeatAge > 180);
  const connectivityOffline = worker?.desiredState === "running" && worker.connectivityStatus === "offline";
  const shouldOfferStop = Boolean(worker?.desiredState === "running" && (worker.running || worker.processAlive));

  useEffect(() => {
    void loadWorker();
    const intervalId = window.setInterval(() => void loadWorker(), 10_000);
    return () => window.clearInterval(intervalId);
  }, [loadWorker]);

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timerId);
  }, []);

  return (
    <section aria-label="Worker status" className="border-y py-3">
      <div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Worker Pulse</p>
              <span
                className={`text-xs font-medium ${
                  connectivityOffline
                    ? "text-destructive"
                    : worker?.running
                    ? "text-emerald-600 dark:text-emerald-400"
                    : stale
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground"
                }`}
              >
                {connectivityOffline ? "Connectivity degraded" : worker?.running ? "Running" : worker?.processAlive ? "Standby" : "Offline"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Heartbeat: {heartbeatAge === null ? "--" : `${heartbeatAge}s ago`}</p>
            <details className="group text-xs text-muted-foreground">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 hover:text-foreground">
                Details <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-l pl-3">
                <span>Last cycle: {worker?.lastCycleAt ? new Date(worker.lastCycleAt).toLocaleString() : "--"}</span>
                <span>PID: {worker?.processAlive ? worker?.pid ?? "--" : "Offline"}</span>
                <span>Backlog: {worker?.observability?.summary.dueBacklog ?? 0}</span>
                <span>Cycle duration: {formatNullableMs(worker?.lastCycleDurationMs)}</span>
                <span>{sanitizeWorkerStatusMessage(error ?? worker?.statusMessage) ?? "Worker status will appear here."}</span>
              </div>
            </details>
            {error ? <p role="alert" className="text-xs text-destructive">{sanitizeWorkerStatusMessage(error)}</p> : null}
          </div>

          <Button
            type="button"
            variant={shouldOfferStop ? "outline" : "default"}
            className={
              shouldOfferStop
                ? "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                : ""
            }
            onClick={() => void toggleWorker()}
            disabled={commandLoading || !worker}
          >
            {shouldOfferStop ? <Square className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
            {commandLoading ? "Applying..." : shouldOfferStop ? "Stop Worker" : "Start Worker"}
          </Button>
        </div>

        {stale ? (
          <div className="mt-3 flex items-center gap-2 border-l-2 border-amber-500 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <Activity className="h-3.5 w-3.5" />
            The worker has not reported a healthy heartbeat recently.
          </div>
        ) : null}
        {connectivityOffline ? (
          <div className="mt-3 flex items-center gap-2 border-l-2 border-destructive px-3 py-2 text-xs text-destructive">
            <WifiOff className="h-3.5 w-3.5" />
            {worker.connectivityMessage ?? "Internet connectivity is unavailable. Monitor checks, webhook retries, and scheduled reports are paused without changing monitor states."}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function formatNullableMs(value: number | null | undefined) {
  return typeof value === "number" ? `${value}ms` : "--";
}
