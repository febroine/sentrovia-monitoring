"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Send,
  ServerCog,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SystemHealthResponse {
  generatedAt: string;
  overallStatus: "healthy" | "attention" | "critical";
  alarms: Array<{
    id: string;
    severity: "critical" | "warning" | "info";
    title: string;
    detail: string;
  }>;
  worker: {
    desiredState: string;
    running: boolean;
    processAlive: boolean;
    connectivityStatus: "unknown" | "online" | "offline" | "disabled";
    heartbeatAgeMs: number | null;
    lastCycleAt: string | null;
  };
  queue: {
    dueBacklog: number;
    delayedMonitorCount: number;
  };
  delivery: {
    failedLast24Hours: number;
    queuedLast24Hours: number;
  };
}

export function SystemHealthCard() {
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHealth = useCallback(async (showRefreshState = false) => {
    if (showRefreshState) {
      setRefreshing(true);
    }

    try {
      const response = await fetch("/api/system/health", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as {
        health?: SystemHealthResponse;
        message?: string;
      } | null;

      if (!response.ok || !data?.health) {
        throw new Error(data?.message ?? "Unable to load system health.");
      }

      setHealth(data.health);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load system health.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
    const intervalId = window.setInterval(() => void loadHealth(), 15_000);
    return () => window.clearInterval(intervalId);
  }, [loadHealth]);

  const status = health ? formatOverallStatus(health.overallStatus) : "Loading";
  const workerRunning = Boolean(health?.worker.running && health.worker.processAlive);
  const workerStatus = health
    ? workerRunning
      ? "Running"
      : health.worker.desiredState === "stopped"
        ? "Stopped"
        : "Unhealthy"
    : "--";
  const connectivityStatus = health ? formatConnectivityStatus(health.worker.connectivityStatus) : "--";
  const visibleAlarms = health?.alarms.slice(0, 2) ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">System Health</CardTitle>
              <Badge variant="outline" className={statusBadgeClass(health?.overallStatus)}>
                {status}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Worker, check queue, connectivity, and notification delivery at a glance.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Refresh system health"
            title="Refresh system health"
            onClick={() => void loadHealth(true)}
            disabled={refreshing}
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-4">
        {error ? (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            {error}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <HealthMetric icon={ServerCog} label="Worker" value={workerStatus} tone={workerRunning ? "healthy" : "critical"} />
          <HealthMetric
            icon={health?.worker.connectivityStatus === "offline" ? WifiOff : Wifi}
            label="Internet"
            value={connectivityStatus}
            tone={health?.worker.connectivityStatus === "online" ? "healthy" : health?.worker.connectivityStatus === "offline" ? "critical" : "neutral"}
          />
          <HealthMetric icon={Clock3} label="Due queue" value={health ? String(health.queue.dueBacklog) : "--"} tone={health && health.queue.delayedMonitorCount > 0 ? "warning" : "neutral"} />
          <HealthMetric icon={Send} label="Failed delivery" value={health ? String(health.delivery.failedLast24Hours) : "--"} tone={health && health.delivery.failedLast24Hours > 0 ? "critical" : "neutral"} />
        </div>

        {loading && !health ? (
          <p className="text-xs text-muted-foreground">Loading health signals...</p>
        ) : visibleAlarms.length > 0 ? (
          <div className="divide-y divide-border rounded-lg border border-border/70">
            {visibleAlarms.map((alarm) => (
              <div key={alarm.id} className="flex items-start gap-2.5 px-3 py-2.5">
                <AlertTriangle className={cn("mt-0.5 size-3.5", alarm.severity === "critical" ? "text-destructive" : "text-amber-500")} />
                <div className="min-w-0">
                  <p className="text-xs font-medium">{alarm.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{alarm.detail}</p>
                </div>
              </div>
            ))}
            {health && health.alarms.length > visibleAlarms.length ? (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">
                +{health.alarms.length - visibleAlarms.length} more active alarm(s)
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-3.5" />
            No active worker, queue, or delivery alarms.
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>Queued deliveries: {health?.delivery.queuedLast24Hours ?? "--"}</span>
          <span>Last cycle: {formatDateTime(health?.worker.lastCycleAt)}</span>
          <span>Updated: {formatDateTime(health?.generatedAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function HealthMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ServerCog;
  label: string;
  value: string;
  tone: "healthy" | "warning" | "critical" | "neutral";
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/10 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className={cn("size-3.5 shrink-0", metricToneClass(tone))} />
        <span className="truncate text-xs text-muted-foreground">{label}</span>
      </div>
      <span className={cn("text-xs font-semibold", metricToneClass(tone))}>{value}</span>
    </div>
  );
}

function formatOverallStatus(status: SystemHealthResponse["overallStatus"]) {
  return status === "healthy" ? "Healthy" : status === "critical" ? "Critical" : "Attention";
}

function statusBadgeClass(status: SystemHealthResponse["overallStatus"] | undefined) {
  if (status === "healthy") return "border-emerald-500/30 text-emerald-600 dark:text-emerald-400";
  if (status === "critical") return "border-destructive/30 text-destructive";
  return "border-amber-500/30 text-amber-600 dark:text-amber-400";
}

function metricToneClass(tone: "healthy" | "warning" | "critical" | "neutral") {
  if (tone === "healthy") return "text-emerald-600 dark:text-emerald-400";
  if (tone === "warning") return "text-amber-600 dark:text-amber-400";
  if (tone === "critical") return "text-destructive";
  return "text-muted-foreground";
}

function formatConnectivityStatus(status: SystemHealthResponse["worker"]["connectivityStatus"]) {
  if (status === "online") return "Online";
  if (status === "offline") return "Paused";
  if (status === "disabled") return "Not checked";
  return "Waiting";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
}
