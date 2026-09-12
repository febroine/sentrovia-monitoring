"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, type TimeDisplaySettings } from "@/lib/time";
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
}

export function SystemHealthCard({
  timeDisplaySettings,
}: {
  timeDisplaySettings?: TimeDisplaySettings;
}) {
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
    <section className="h-full rounded-lg bg-card p-4 shadow-sm sm:p-5">
      <header>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-medium">System Health</h2>
              <Badge variant="outline" className={statusBadgeClass(health?.overallStatus)}>
                {status}
              </Badge>
            </div>
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
      </header>

      <div className="space-y-3 pt-4">
        {error ? (
          <div className="rounded-md bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300">
            {error}
          </div>
        ) : null}

        <dl className="grid gap-2 sm:grid-cols-3">
          <HealthMetric label="Worker" value={workerStatus} tone={workerRunning ? "healthy" : "critical"} />
          <HealthMetric
            label="Internet"
            value={connectivityStatus}
            tone={health?.worker.connectivityStatus === "online" ? "healthy" : health?.worker.connectivityStatus === "offline" ? "critical" : "neutral"}
          />
          <HealthMetric label="Due queue" value={health ? String(health.queue.dueBacklog) : "--"} tone={health && health.queue.delayedMonitorCount > 0 ? "warning" : "neutral"} />
        </dl>

        {loading && !health ? (
          <p className="text-xs text-muted-foreground">Loading health signals...</p>
        ) : visibleAlarms.length > 0 ? (
          <div className="grid gap-2 overflow-hidden rounded-md">
            {visibleAlarms.map((alarm) => (
              <div key={alarm.id} className="flex items-start gap-2.5 bg-background/25 px-3 py-2.5">
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
          <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="size-3.5" />
            No active worker, connectivity, or queue alarms.
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/25 px-3 py-2 text-[11px] text-muted-foreground">
          <span>Last cycle: {formatDateTime(health?.worker.lastCycleAt, timeDisplaySettings)}</span>
          <span>Updated: {formatDateTime(health?.generatedAt, timeDisplaySettings)}</span>
        </div>
      </div>
    </section>
  );
}

function HealthMetric({ label, value, tone }: {
  label: string;
  value: string;
  tone: "healthy" | "warning" | "critical" | "neutral";
}) {
  return (
    <div className="rounded-md bg-background/35 px-3 py-3">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("mt-2 text-sm font-semibold", metricToneClass(tone))}>{value}</dd>
    </div>
  );
}

function formatOverallStatus(status: SystemHealthResponse["overallStatus"]) {
  return status === "healthy" ? "Healthy" : status === "critical" ? "Critical" : "Attention";
}

function statusBadgeClass(status: SystemHealthResponse["overallStatus"] | undefined) {
  if (status === "healthy") return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (status === "critical") return "bg-destructive/10 text-destructive";
  return "bg-amber-500/10 text-amber-600 dark:text-amber-400";
}

function metricToneClass(tone: "healthy" | "warning" | "critical" | "neutral") {
  if (tone === "healthy") return "text-emerald-600 dark:text-emerald-400";
  if (tone === "warning") return "text-amber-600 dark:text-amber-400";
  if (tone === "critical") return "text-destructive";
  return "text-muted-foreground";
}

function formatConnectivityStatus(status: SystemHealthResponse["worker"]["connectivityStatus"]) {
  if (status === "online") return "Online";
  if (status === "offline") return "Unavailable";
  if (status === "disabled") return "Not checked";
  return "Waiting";
}
