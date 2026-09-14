"use client";

import { useEffect, useState } from "react";
import { Activity, ChevronDown, Play, Square, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkerStore } from "@/stores/use-worker-store";
import { sanitizeWorkerStatusMessage } from "@/lib/worker/status-message";
import { formatPanelDateTime } from "@/lib/time";

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
    <section aria-label="Worker status" className="rounded-lg bg-card/55 p-4">
      <div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
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
            </div>
            <details className="group mt-2 text-xs text-muted-foreground">
              <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
                Details <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2 grid gap-x-6 gap-y-2 border-t border-border/70 pt-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,max-content)_minmax(14rem,1fr)]">
                <WorkerDetail label="Last cycle" value={formatPanelDateTime(worker?.lastCycleAt)} />
                <WorkerDetail label="PID" value={worker?.processAlive ? String(worker?.pid ?? "--") : "Offline"} />
                <WorkerDetail label="Backlog" value={String(worker?.observability?.summary.dueBacklog ?? 0)} />
                <WorkerDetail label="Cycle duration" value={formatNullableMs(worker?.lastCycleDurationMs)} />
                <WorkerDetail label="Status" value={sanitizeWorkerStatusMessage(error ?? worker?.statusMessage) ?? "Worker status will appear here."} />
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
            {shouldOfferStop ? <Square data-icon="inline-start" className="h-4 w-4" /> : <Play data-icon="inline-start" className="h-4 w-4" />}
            {commandLoading ? "Applying..." : shouldOfferStop ? "Stop Worker" : "Start Worker"}
          </Button>
        </div>

        {stale ? (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <Activity className="h-3.5 w-3.5" />
            The worker has not reported a healthy heartbeat recently.
          </div>
        ) : null}
        {connectivityOffline ? (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <WifiOff className="h-3.5 w-3.5" />
            {worker.connectivityMessage ?? "Internet connectivity is unavailable. Monitor checks, webhook retries, and scheduled reports are paused without changing monitor states."}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function WorkerDetail({ label, value }: { label: string; value: string }) {
  return (
    <span className="min-w-0">
      <span className="font-medium text-foreground">{label}</span>
      <span className="ml-1 break-words">{value}</span>
    </span>
  );
}

function formatNullableMs(value: number | null | undefined) {
  return typeof value === "number" ? `${value}ms` : "--";
}
