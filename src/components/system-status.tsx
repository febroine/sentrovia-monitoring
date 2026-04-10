"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Cpu, HardDrive, LoaderCircle, Play, RefreshCw, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useWorkerStore } from "@/stores/use-worker-store";

interface SystemData {
  cpu: { usage: number; model: string; cores: number };
  memory: { total: number; used: number; free: number; usagePct: number };
  uptime: { process: number; os: number };
  system: { platform: string; arch: string; hostname: string; nodeVersion: string };
}

const HEARTBEAT_STALE_MS = 180_000;

export function SystemStatus() {
  const { worker, commandLoading, error, loadWorker, toggleWorker } = useWorkerStore();
  const [sys, setSys] = useState<SystemData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refreshAll = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) {
      setRefreshing(true);
    }

    try {
      const response = await fetch("/api/system", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Unable to refresh telemetry.");
      }

      const systemData = (await response.json()) as SystemData;
      setSys(systemData);
      await loadWorker();
      setLastUpdated(new Date());
    } finally {
      if (showSpinner) {
        setRefreshing(false);
      }
    }
  }, [loadWorker]);

  useEffect(() => {
    void refreshAll(false);
    const intervalId = window.setInterval(() => void refreshAll(false), 10_000);
    return () => window.clearInterval(intervalId);
  }, [refreshAll]);

  const workerActive = worker?.running ?? false;
  const desiredRunning = worker?.desiredState === "running";
  const processAlive = worker?.processAlive ?? false;
  const uptimeSeconds = worker?.startedAt ? Math.floor((Date.now() - new Date(worker.startedAt).getTime()) / 1000) : 0;
  const heartbeatAgeMs = worker?.heartbeatAt ? Date.now() - new Date(worker.heartbeatAt).getTime() : null;
  const heartbeatStale = Boolean(desiredRunning && (heartbeatAgeMs === null || heartbeatAgeMs > HEARTBEAT_STALE_MS));
  const observability = worker?.observability;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">System Status</CardTitle>
              <Badge
                variant="outline"
                className={cn(
                  workerActive
                    ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                    : desiredRunning
                      ? "border-amber-500/30 text-amber-600 dark:text-amber-400"
                      : "border-border text-muted-foreground"
                )}
              >
                {workerActive ? "Running" : desiredRunning ? "Starting" : "Idle"}
              </Badge>
            </div>
            <CardDescription>Compact runtime overview and DB-backed worker control.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void refreshAll(true)}>
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        {heartbeatStale ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            Worker heartbeat is stale. The web console has not seen a fresh heartbeat in the last {Math.floor(HEARTBEAT_STALE_MS / 1000)} seconds.
          </div>
        ) : null}
        {desiredRunning && !processAlive ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Worker process is offline. Use Start Worker to launch a fresh runner process.
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Host" value={sys?.system.hostname ?? "--"} />
              <Metric label="Node" value={sys?.system.nodeVersion ?? "--"} />
              <Metric
                label="Updated"
                value={lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
              />
            </div>
            <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-3">
              <StatusBar
                label="CPU"
                value={sys?.cpu.usage ?? 0}
                detail={sys ? `${sys.cpu.cores} cores · ${sys.system.platform}` : "Waiting for telemetry"}
              />
              <StatusBar
                label="Memory"
                value={sys?.memory.usagePct ?? 0}
                detail={sys ? `${formatBytes(sys.memory.used)} / ${formatBytes(sys.memory.total)}` : "Waiting for telemetry"}
              />
              <StatusBar
                label="Process uptime"
                value={calculateUptimePct(sys?.uptime.process ?? 0, sys?.uptime.os ?? 0)}
                detail={sys ? `${formatDuration(Math.floor(sys.uptime.process))} app uptime · ${sys.system.arch}` : "Waiting for telemetry"}
              />
              <div className="grid gap-3 pt-1 sm:grid-cols-3">
                <Metric
                  label="CPU Profile"
                  value={sys ? truncateValue(sys.cpu.model, 18) : "--"}
                />
                <Metric
                  label="Platform"
                  value={sys ? `${sys.system.platform} · ${sys.system.arch}` : "--"}
                />
                <Metric
                  label="OS Uptime"
                  value={sys ? formatDuration(Math.floor(sys.uptime.os)) : "--"}
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/10 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Worker</p>
                <p className="mt-1 text-xs text-muted-foreground">{worker?.statusMessage ?? "Worker status will appear here."}</p>
              </div>
              <div
                className={cn(
                  "rounded-full p-2",
                  workerActive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"
                )}
              >
                <Activity className="size-4" />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <MetricPanel icon={Cpu} label="Checks" value={worker ? worker.checkedCount.toLocaleString() : "--"} />
              <MetricPanel icon={HardDrive} label="Uptime" value={workerActive ? formatDuration(uptimeSeconds) : "--"} />
              <MetricPanel
                icon={Activity}
                label="Heartbeat"
                value={heartbeatAgeMs === null ? "--" : `${Math.max(0, Math.floor(heartbeatAgeMs / 1000))}s ago`}
              />
              <MetricPanel icon={Activity} label="Process" value={processAlive ? `PID ${worker?.pid ?? "--"}` : "Offline"} />
            </div>

            <Button
              type="button"
              className={cn(
                "mt-4 w-full",
                desiredRunning
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              )}
              variant="default"
              onClick={() => void toggleWorker()}
              disabled={commandLoading || !worker}
            >
              {commandLoading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : desiredRunning ? (
                <Square className="size-4 fill-current text-destructive" />
              ) : (
                <Play className="size-4 fill-current" />
              )}
              {commandLoading ? "Applying" : desiredRunning ? "Stop Worker" : "Start Worker"}
            </Button>
          </div>
        </div>

        {observability ? (
          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-4 rounded-lg border border-border bg-muted/10 p-3">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricPanel icon={Activity} label="Due Backlog" value={String(observability.summary.dueBacklog)} />
                <MetricPanel icon={Activity} label="Checks / Hour" value={String(observability.summary.checksLastHour)} />
                <MetricPanel icon={Activity} label="Failures / Day" value={String(observability.summary.failuresLast24Hours)} />
                <MetricPanel
                  icon={Activity}
                  label="Last Cycle"
                  value={
                    observability.summary.lastCycleDurationMs === null
                      ? "--"
                      : `${observability.summary.lastCycleDurationMs}ms`
                  }
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Metric
                  label="Cycle Mix"
                  value={`${observability.summary.lastCycleSuccessCount} up · ${observability.summary.lastCyclePendingCount} pending · ${observability.summary.lastCycleFailureCount} down`}
                />
                <Metric
                  label="24h Avg Latency"
                  value={`${observability.summary.averageLatencyMs24Hours} ms`}
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Recent Cycles</p>
                {observability.recentCycles.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No cycle metrics recorded yet.</p>
                ) : (
                  observability.recentCycles.slice(0, 4).map((cycle) => (
                    <div key={cycle.id} className="rounded-lg border border-border bg-background px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{cycle.completedMonitors} completed</p>
                        <span className="text-xs text-muted-foreground">{cycle.durationMs}ms</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Backlog {cycle.backlogAtStart} · {cycle.successCount} up · {cycle.pendingCount} pending · {cycle.failureCount} down
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <InsightList
                title="Slow Monitors"
                empty="No latency samples yet."
                items={observability.slowMonitors.map((monitor) => ({
                  key: monitor.monitorId,
                  title: monitor.name,
                  detail: `${monitor.averageLatencyMs}ms avg · ${monitor.sampleCount} checks · ${monitor.status}`,
                }))}
              />
              <InsightList
                title="Failing Monitors"
                empty="No failures in the last 24 hours."
                items={observability.failingMonitors.map((monitor) => ({
                  key: monitor.monitorId,
                  title: monitor.name,
                  detail: `${monitor.failureCount} failures · ${monitor.status}`,
                }))}
              />
              <InsightList
                title="Recent Worker Errors"
                empty="No worker-level cycle errors recorded."
                items={observability.recentErrors.map((errorItem, index) => ({
                  key: `${errorItem.createdAt}-${index}`,
                  title: new Date(errorItem.createdAt).toLocaleString(),
                  detail: errorItem.message,
                }))}
              />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-muted/20 px-3 py-2"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>;
}

function MetricPanel({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-background px-3 py-2"><div className="flex items-center gap-2 text-muted-foreground"><Icon className="size-3.5" /><span className="text-[11px] uppercase tracking-wide">{label}</span></div><p className="mt-1 text-sm font-medium">{value}</p></div>;
}

function InsightList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ key: string; title: string; detail: string }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/10 p-3">
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">{empty}</p>
        ) : (
          items.map((item) => (
            <div key={item.key} className="rounded-lg border border-border bg-background px-3 py-2">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StatusBar({ label, value, detail }: { label: string; value: number; detail: string }) {
  const tone = value >= 85 ? "bg-destructive" : value >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return <div className="space-y-1.5"><div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium">{label}</span><span className="tabular-nums text-muted-foreground">{value.toFixed(0)}%</span></div><div className="h-2 rounded-full bg-muted"><div className={cn("h-full rounded-full transition-all duration-500", tone)} style={{ width: `${Math.max(6, Math.min(value, 100))}%` }} /></div><p className="text-xs text-muted-foreground">{detail}</p></div>;
}

function formatBytes(bytes: number) {
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function calculateUptimePct(processUptime: number, osUptime: number) {
  if (processUptime <= 0 || osUptime <= 0) {
    return 0;
  }

  return Math.max(1, Math.min(100, (processUptime / osUptime) * 100));
}

function truncateValue(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}
