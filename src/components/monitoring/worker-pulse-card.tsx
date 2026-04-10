"use client";

import { useEffect, useState } from "react";
import { Activity, Play, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useWorkerStore } from "@/stores/use-worker-store";

export function WorkerPulseCard() {
  const { worker, commandLoading, error, loadWorker, toggleWorker } = useWorkerStore();
  const [now, setNow] = useState(() => Date.now());
  const heartbeatAge = worker?.heartbeatAt ? Math.max(0, Math.floor((now - new Date(worker.heartbeatAt).getTime()) / 1000)) : null;
  const stale = worker?.desiredState === "running" && (heartbeatAge === null || heartbeatAge > 180);

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
              <Badge
                variant="outline"
                className={
                  worker?.running
                    ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                    : stale
                      ? "border-amber-500/30 text-amber-600 dark:text-amber-400"
                      : "border-border text-muted-foreground"
                }
              >
                {worker?.running ? "Running" : worker?.processAlive ? "Standby" : "Offline"}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>Heartbeat: {heartbeatAge === null ? "--" : `${heartbeatAge}s ago`}</span>
              <span>Last Cycle: {worker?.lastCycleAt ? new Date(worker.lastCycleAt).toLocaleString() : "--"}</span>
              <span>PID: {worker?.processAlive ? worker?.pid ?? "--" : "Offline"}</span>
            </div>
            <p className="text-xs text-muted-foreground">{error ?? worker?.statusMessage ?? "Worker status will appear here."}</p>
          </div>

          <Button
            type="button"
            variant={worker?.desiredState === "running" ? "outline" : "default"}
            className={worker?.desiredState === "running" ? "" : "bg-violet-600 text-white hover:bg-violet-500"}
            onClick={() => void toggleWorker()}
            disabled={commandLoading}
          >
            {worker?.desiredState === "running" ? <Square className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
            {commandLoading ? "Applying..." : worker?.desiredState === "running" ? "Stop Worker" : "Start Worker"}
          </Button>
        </div>

        {stale ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <Activity className="h-3.5 w-3.5" />
            The worker has not reported a healthy heartbeat recently.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
