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
const REFRESH_INTERVAL_MS = 10_000;

export function SystemStatus({ use24HourClock = true }: { use24HourClock?: boolean }) {
  const { worker, commandLoading, error, loadWorker, toggleWorker } = useWorkerStore();
  const [systemData, setSystemData] = useState<SystemData | null>(null);
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

      const payload = (await response.json()) as SystemData;
      setSystemData(payload);
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
    const intervalId = window.setInterval(() => void refreshAll(false), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [refreshAll]);

  const workerActive = worker?.running ?? false;
  const desiredRunning = worker?.desiredState === "running";
  const processAlive = worker?.processAlive ?? false;
  const uptimeSeconds = worker?.startedAt
    ? Math.floor((Date.now() - new Date(worker.startedAt).getTime()) / 1000)
    : 0;
  const heartbeatAgeMs = worker?.heartbeatAt
    ? Date.now() - new Date(worker.heartbeatAt).getTime()
    : null;
  const heartbeatStale = Boolean(
    desiredRunning && (heartbeatAgeMs === null || heartbeatAgeMs > HEARTBEAT_STALE_MS)
  );

  return (
    <Card className="border-border bg-gradient-to-br from-card via-card to-muted/20">
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
            <CardDescription>
              Runtime telemetry and direct worker controls for the active runner process.
            </CardDescription>
          </div>

          <Button type="button" variant="outline" size="sm" onClick={() => void refreshAll(true)}>
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? <InlineAlert tone="danger" message={error} /> : null}
        {heartbeatStale ? (
          <InlineAlert
            tone="warning"
            message={`Worker heartbeat is stale. No fresh heartbeat arrived in the last ${Math.floor(
              HEARTBEAT_STALE_MS / 1000
            )} seconds.`}
          />
        ) : null}
        {desiredRunning && !processAlive ? (
          <InlineAlert
            tone="danger"
            message="Worker process is offline. Use Start Worker to launch a fresh runner process."
          />
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Host" value={systemData?.system.hostname ?? "--"} />
              <Metric label="Node" value={systemData?.system.nodeVersion ?? "--"} />
              <Metric
                label="Updated"
                value={
                  lastUpdated
                    ? lastUpdated.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: !use24HourClock,
                      })
                    : "--:--"
                }
              />
            </div>

            <div className="space-y-4 rounded-2xl border border-border/70 bg-muted/10 p-4">
              <StatusBar
                label="CPU"
                value={systemData?.cpu.usage ?? 0}
                detail={
                  systemData
                    ? `${systemData.cpu.cores} cores / ${systemData.system.platform}`
                    : "Waiting for telemetry"
                }
              />
              <StatusBar
                label="Memory"
                value={systemData?.memory.usagePct ?? 0}
                detail={
                  systemData
                    ? `${formatBytes(systemData.memory.used)} / ${formatBytes(systemData.memory.total)}`
                    : "Waiting for telemetry"
                }
              />
              <StatusBar
                label="Process uptime"
                value={calculateUptimePct(systemData?.uptime.process ?? 0, systemData?.uptime.os ?? 0)}
                detail={
                  systemData
                    ? `${formatDuration(Math.floor(systemData.uptime.process))} app uptime / ${systemData.system.arch}`
                    : "Waiting for telemetry"
                }
              />

              <div className="grid gap-3 pt-1 sm:grid-cols-3">
                <Metric
                  label="CPU Profile"
                  value={systemData ? truncateValue(systemData.cpu.model, 18) : "--"}
                />
                <Metric
                  label="Platform"
                  value={systemData ? `${systemData.system.platform} / ${systemData.system.arch}` : "--"}
                />
                <Metric
                  label="OS Uptime"
                  value={systemData ? formatDuration(Math.floor(systemData.uptime.os)) : "--"}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Worker</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {worker?.statusMessage ?? "Worker status will appear here."}
                </p>
              </div>
              <div
                className={cn(
                  "rounded-full p-2",
                  workerActive
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
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
              <MetricPanel
                icon={Activity}
                label="Process"
                value={processAlive ? `PID ${worker?.pid ?? "--"}` : "Offline"}
              />
            </div>

            <Button
              type="button"
              className={cn(
                "mt-4 w-full",
                desiredRunning
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              )}
              onClick={() => void toggleWorker()}
              disabled={commandLoading || !worker}
            >
              {commandLoading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : desiredRunning ? (
                <Square className="size-4 fill-current" />
              ) : (
                <Play className="size-4 fill-current" />
              )}
              {commandLoading ? "Applying" : desiredRunning ? "Stop Worker" : "Start Worker"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function MetricPanel({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background px-3 py-2.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function StatusBar({ label, value, detail }: { label: string; value: number; detail: string }) {
  const tone = value >= 85 ? "bg-destructive" : value >= 70 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">{value.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-500", tone)}
          style={{ width: `${Math.max(6, Math.min(value, 100))}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function InlineAlert({
  tone,
  message,
}: {
  tone: "danger" | "warning";
  message: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2 text-sm",
        tone === "danger" && "border-destructive/20 bg-destructive/5 text-destructive",
        tone === "warning" && "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300"
      )}
    >
      {message}
    </div>
  );
}

function formatBytes(bytes: number) {
  const gigabytes = bytes / 1024 ** 3;
  return gigabytes >= 1 ? `${gigabytes.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`;
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
