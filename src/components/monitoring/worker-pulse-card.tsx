"use client";

import { useEffect, useState } from "react";
import { Activity, Play, Square, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card className="overflow-hidden">
      <CardContent className="border-l-2 border-l-sky-500 px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
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
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Heartbeat: {heartbeatAge === null ? "--" : `${heartbeatAge}s ago`}</span>
              <span>Last Cycle: {worker?.lastCycleAt ? new Date(worker.lastCycleAt).toLocaleString() : "--"}</span>
              <span>PID: {worker?.processAlive ? worker?.pid ?? "--" : "Offline"}</span>
              <span>Backlog: {worker?.observability?.summary.dueBacklog ?? 0}</span>
              <span>Cycle Duration: {formatNullableMs(worker?.lastCycleDurationMs)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {sanitizeWorkerStatusMessage(error ?? worker?.statusMessage)
                ?? "Worker status will appear here."}
            </p>
          </div>

          <Button
            type="button"
            variant="default"
            className={
              shouldOfferStop
                ? "bg-destructive text-white hover:bg-destructive/90"
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
      </CardContent>
    </Card>
  );
}

function formatNullableMs(value: number | null | undefined) {
  return typeof value === "number" ? `${value}ms` : "--";
}
