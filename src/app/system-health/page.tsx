"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  HeartPulse,
  RefreshCw,
  Send,
  ServerCog,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    heartbeatAt: string | null;
    heartbeatAgeMs: number | null;
    lastCycleAt: string | null;
    lastCycleDurationMs: number | null;
    lastCycleBacklog: number;
    lastErrorAt: string | null;
    lastErrorMessage: string | null;
    connectivityStatus: "unknown" | "online" | "offline" | "disabled";
    connectivityCheckedAt: string | null;
    connectivityMessage: string | null;
  };
  queue: {
    dueBacklog: number;
    delayedMonitorCount: number;
    delayedMonitors: Array<{
      id: string;
      name: string;
      target: string;
      dueAt: string;
      delayMs: number;
      verificationMode: boolean;
    }>;
  };
  delivery: {
    failedLast24Hours: number;
    queuedLast24Hours: number;
    recentFailures: Array<{
      id: string;
      channel: string;
      kind: string;
      destination: string;
      status: string;
      attempts: number;
      errorMessage: string | null;
      createdAt: string;
    }>;
  };
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<SystemHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
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
    }
  }, []);

  useEffect(() => {
    void loadHealth();
    const intervalId = window.setInterval(() => void loadHealth(), 15_000);
    return () => window.clearInterval(intervalId);
  }, [loadHealth]);

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <HeartPulse className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">System Health</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Worker scheduling and notification delivery health. No alerts are sent from this page.
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadHealth()} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} />
          Refresh
        </Button>
      </section>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Overall status"
          value={health ? formatOverallStatus(health.overallStatus) : "--"}
          icon={health?.overallStatus === "healthy" ? CheckCircle2 : AlertTriangle}
          tone={health?.overallStatus === "critical" ? "critical" : health?.overallStatus === "attention" ? "warning" : "healthy"}
        />
        <MetricCard
          label="Worker"
          value={health ? (health.worker.running && health.worker.processAlive ? "Running" : health.worker.desiredState === "stopped" ? "Stopped" : "Unhealthy") : "--"}
          icon={ServerCog}
          tone={health?.worker.running && health.worker.processAlive ? "healthy" : health?.worker.desiredState === "stopped" ? "neutral" : "critical"}
        />
        <MetricCard
          label="Internet"
          value={health ? formatConnectivityStatus(health.worker.connectivityStatus) : "--"}
          icon={health?.worker.connectivityStatus === "offline" ? WifiOff : Wifi}
          tone={health?.worker.connectivityStatus === "offline" ? "critical" : health?.worker.connectivityStatus === "online" ? "healthy" : "neutral"}
        />
        <MetricCard
          label="Due queue"
          value={health ? String(health.queue.dueBacklog) : "--"}
          icon={Activity}
          tone={health?.worker.connectivityStatus === "offline" ? "neutral" : health && health.queue.delayedMonitorCount > 0 ? "warning" : "healthy"}
        />
        <MetricCard
          label="Failed notifications"
          value={health ? String(health.delivery.failedLast24Hours) : "--"}
          icon={Send}
          tone={health && health.delivery.failedLast24Hours > 0 ? "critical" : "healthy"}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">Active system alarms</CardTitle>
            <Badge variant="outline">{health?.alarms.length ?? 0} active</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {health?.alarms.length ? (
            <div className="divide-y divide-border rounded-lg border border-border/70">
              {health.alarms.map((alarm) => (
                <div key={alarm.id} className="flex items-start gap-3 px-4 py-3">
                  <AlertTriangle className={alarm.severity === "critical" ? "mt-0.5 size-4 text-destructive" : alarm.severity === "warning" ? "mt-0.5 size-4 text-amber-500" : "mt-0.5 size-4 text-sky-500"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{alarm.title}</p>
                      <Badge variant="outline" className="capitalize">{alarm.severity}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{alarm.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-4 text-sm">
              <CheckCircle2 className="size-5 text-emerald-500" />
              No active worker, queue, or notification delivery alarms.
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Delayed checks</CardTitle>
              <Badge variant="outline">{health?.queue.delayedMonitorCount ?? 0}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {health?.worker.connectivityStatus === "offline" ? (
              <EmptyMetric icon={WifiOff} text="Scheduling is paused while the worker host has no internet connection." />
            ) : health?.queue.delayedMonitors.length ? (
              <div className="divide-y divide-border">
                {health.queue.delayedMonitors.map((monitor) => (
                  <div key={monitor.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium">{monitor.name}</p>
                      <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">{formatDuration(monitor.delayMs)} late</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{monitor.target}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyMetric icon={Clock3} text="All active monitors are within their scheduling window." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">Recent notification failures</CardTitle>
              <Badge variant="outline">24 hours</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {health?.delivery.recentFailures.length ? (
              <div className="divide-y divide-border">
                {health.delivery.recentFailures.map((event) => (
                  <div key={event.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium capitalize">{event.channel} - {event.kind}</p>
                      <span className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{event.destination}</p>
                    <p className="mt-1 text-xs text-destructive">{event.errorMessage ?? "Delivery failed without an error message."}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyMetric icon={Send} text="No failed notification deliveries in the last 24 hours." />
            )}
          </CardContent>
        </Card>
      </div>

      {health ? (
        <p className="text-right text-xs text-muted-foreground">Last refreshed {formatDate(health.generatedAt)}</p>
      ) : null}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Activity;
  tone: "healthy" | "warning" | "critical" | "neutral";
}) {
  const toneClass = tone === "critical" ? "text-destructive" : tone === "warning" ? "text-amber-500" : tone === "healthy" ? "text-emerald-500" : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-lg font-semibold">{value}</p>
        </div>
        <Icon className={`size-5 ${toneClass}`} />
      </CardContent>
    </Card>
  );
}

function EmptyMetric({ icon: Icon, text }: { icon: typeof Activity; text: string }) {
  return (
    <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
      <Icon className="size-4" />
      {text}
    </div>
  );
}

function formatOverallStatus(status: SystemHealthResponse["overallStatus"]) {
  return status === "healthy" ? "Healthy" : status === "critical" ? "Critical" : "Needs attention";
}

function formatConnectivityStatus(status: SystemHealthResponse["worker"]["connectivityStatus"]) {
  if (status === "online") return "Online";
  if (status === "offline") return "Paused";
  if (status === "disabled") return "Not checked";
  return "Waiting";
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 60_000) return `${Math.ceil(milliseconds / 1_000)}s`;
  if (milliseconds < 3_600_000) return `${Math.ceil(milliseconds / 60_000)}m`;
  return `${Math.ceil(milliseconds / 3_600_000)}h`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
}
