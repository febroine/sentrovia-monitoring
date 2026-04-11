"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Clock3,
  Flame,
  Radar,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { WorkerCycleMetricRecord } from "@/lib/monitors/types";
import { cn } from "@/lib/utils";
import { useWorkerStore } from "@/stores/use-worker-store";

const REFRESH_INTERVAL_MS = 10_000;

export function WorkerObservabilityDashboard() {
  const { worker, error, loadWorker } = useWorkerStore();
  const [refreshing, setRefreshing] = useState(false);

  const observability = worker?.observability ?? null;
  const recentCycles = useMemo(() => observability?.recentCycles ?? [], [observability]);
  const failingMonitors = useMemo(() => observability?.failingMonitors ?? [], [observability]);
  const recentErrors = observability?.recentErrors ?? [];

  const maxCycleDuration = useMemo(
    () => Math.max(1, ...recentCycles.map((cycle) => cycle.durationMs)),
    [recentCycles]
  );

  const maxFailingCount = useMemo(
    () => Math.max(1, ...failingMonitors.map((monitor) => monitor.failureCount)),
    [failingMonitors]
  );

  const refreshDashboard = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) {
      setRefreshing(true);
    }

    try {
      await loadWorker();
    } finally {
      if (showSpinner) {
        setRefreshing(false);
      }
    }
  }, [loadWorker]);

  useEffect(() => {
    if (!worker) {
      void refreshDashboard(false);
    }

    const intervalId = window.setInterval(() => void refreshDashboard(false), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [refreshDashboard, worker]);

  return (
    <Card className="overflow-hidden border-sky-500/20 bg-gradient-to-br from-card via-card to-sky-500/5">
      <CardHeader className="border-b border-border/60 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),transparent_42%,rgba(59,130,246,0.08))] pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                Worker Insights
              </Badge>
              <Badge variant="outline" className="border-border/70 text-muted-foreground">
                Separate dashboard
              </Badge>
            </div>
            <div className="space-y-1">
              <CardTitle className="text-lg">Observability Dashboard</CardTitle>
              <CardDescription className="max-w-3xl">
                Backlog pressure, cycle quality, failing monitors, and worker-side issues in one focused view.
              </CardDescription>
            </div>
          </div>

          <Button type="button" variant="outline" size="sm" onClick={() => void refreshDashboard(true)}>
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            Refresh insights
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        {error ? (
          <InlineAlert tone="danger" message={error} />
        ) : null}

        {!observability ? (
          <InlineAlert
            tone="neutral"
            message="Worker insight metrics will appear here after the runner completes a few cycles."
          />
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <InsightMetric
                icon={Radar}
                label="Due backlog"
                value={String(observability.summary.dueBacklog)}
                detail="Checks waiting to be claimed"
                tone="sky"
              />
              <InsightMetric
                icon={BarChart3}
                label="Checks / hour"
                value={String(observability.summary.checksLastHour)}
                detail="Recent throughput"
                tone="emerald"
              />
              <InsightMetric
                icon={Flame}
                label="Failures / day"
                value={String(observability.summary.failuresLast24Hours)}
                detail="Last 24h monitor failures"
                tone="rose"
              />
              <InsightMetric
                icon={Clock3}
                label="Last cycle"
                value={
                  observability.summary.lastCycleDurationMs === null
                    ? "--"
                    : `${observability.summary.lastCycleDurationMs}ms`
                }
                detail="Most recent scheduler pass"
                tone="amber"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <SignalCard
                    title="Cycle health"
                    subtitle="Success, pending, and down split from the latest worker pass."
                    accent="sky"
                    rows={[
                      {
                        label: "Up checks",
                        value: String(observability.summary.lastCycleSuccessCount),
                        tone: "emerald",
                      },
                      {
                        label: "Pending checks",
                        value: String(observability.summary.lastCyclePendingCount),
                        tone: "amber",
                      },
                      {
                        label: "Down checks",
                        value: String(observability.summary.lastCycleFailureCount),
                        tone: "rose",
                      },
                    ]}
                    footer={`24h avg latency ${observability.summary.averageLatencyMs24Hours} ms`}
                  />

                  <SignalCard
                    title="Pressure bars"
                    subtitle="Fast visual read on queue backlog and failure volume."
                    accent="violet"
                    rows={[
                      {
                        label: "Backlog pressure",
                        value: `${observability.summary.dueBacklog}`,
                        tone: "sky",
                        barValue: calculatePressure(observability.summary.dueBacklog, 40),
                      },
                      {
                        label: "Failure pressure",
                        value: `${observability.summary.failuresLast24Hours}`,
                        tone: "rose",
                        barValue: calculatePressure(observability.summary.failuresLast24Hours, 25),
                      },
                      {
                        label: "Cycle pace",
                        value:
                          observability.summary.lastCycleDurationMs === null
                            ? "--"
                            : `${observability.summary.lastCycleDurationMs}ms`,
                        tone: "amber",
                        barValue: calculateInversePressure(
                          observability.summary.lastCycleDurationMs ?? 0,
                          2_000
                        ),
                      },
                    ]}
                  />
                </div>

                <Card className="border-border/70 bg-background/60">
                  <CardHeader className="border-b border-border/60 pb-3">
                    <CardTitle className="text-base">Recent cycles</CardTitle>
                    <CardDescription>
                      Each line shows cycle duration, backlog at start, and outcome mix.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-4">
                    {recentCycles.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No worker cycle metrics recorded yet.</p>
                    ) : (
                      recentCycles.slice(0, 6).map((cycle) => (
                        <CycleRow
                          key={cycle.id}
                          cycle={cycle}
                          maxDuration={maxCycleDuration}
                        />
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <InsightList
                  title="Failing monitors"
                  description="Monitors with the highest failure count in the last 24 hours."
                  empty="No failures in the last 24 hours."
                  accent="rose"
                  items={failingMonitors.map((monitor) => ({
                    key: monitor.monitorId,
                    title: monitor.name,
                    subtitle: monitor.lastFailureAt
                      ? `Last failure ${new Date(monitor.lastFailureAt).toLocaleString()}`
                      : "No timestamp recorded",
                    value: `${monitor.failureCount} failures`,
                    ratio: Math.max(12, (monitor.failureCount / maxFailingCount) * 100),
                    tone: "rose",
                  }))}
                />

                <InsightList
                  title="Recent worker errors"
                  description="Cycle-level failures that blocked or degraded the scheduler."
                  empty="No worker-level cycle errors recorded."
                  accent="amber"
                  items={recentErrors.map((errorItem, index) => ({
                    key: `${errorItem.createdAt}-${index}`,
                    title: new Date(errorItem.createdAt).toLocaleString(),
                    subtitle: errorItem.message,
                    value: "Worker error",
                    ratio: 100,
                    tone: "amber",
                  }))}
                />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function InsightMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  detail: string;
  tone: "sky" | "emerald" | "rose" | "amber";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-background/70 p-4 shadow-sm",
        tone === "sky" && "border-sky-500/25",
        tone === "emerald" && "border-emerald-500/25",
        tone === "rose" && "border-rose-500/25",
        tone === "amber" && "border-amber-500/25"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="text-3xl font-semibold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
        <div
          className={cn(
            "rounded-xl border p-2.5",
            tone === "sky" && "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
            tone === "emerald" && "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            tone === "rose" && "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
            tone === "amber" && "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          )}
        >
          <Icon className="size-4" />
        </div>
      </div>
    </div>
  );
}

function SignalCard({
  title,
  subtitle,
  rows,
  footer,
  accent,
}: {
  title: string;
  subtitle: string;
  rows: Array<{
    label: string;
    value: string;
    tone: "sky" | "emerald" | "rose" | "amber";
    barValue?: number;
  }>;
  footer?: string;
  accent: "sky" | "violet";
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden border-border/70 bg-background/60",
        accent === "sky" && "shadow-[inset_0_1px_0_rgba(14,165,233,0.12)]",
        accent === "violet" && "shadow-[inset_0_1px_0_rgba(139,92,246,0.12)]"
      )}
    >
      <CardHeader className="border-b border-border/60 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {rows.map((row) => (
          <div key={row.label} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">{row.label}</span>
              <span className="text-sm text-muted-foreground">{row.value}</span>
            </div>
            {typeof row.barValue === "number" ? (
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    row.tone === "sky" && "bg-sky-500",
                    row.tone === "emerald" && "bg-emerald-500",
                    row.tone === "rose" && "bg-rose-500",
                    row.tone === "amber" && "bg-amber-500"
                  )}
                  style={{ width: `${row.barValue}%` }}
                />
              </div>
            ) : null}
          </div>
        ))}
        {footer ? <p className="border-t border-dashed border-border/70 pt-3 text-xs text-muted-foreground">{footer}</p> : null}
      </CardContent>
    </Card>
  );
}

function CycleRow({
  cycle,
  maxDuration,
}: {
  cycle: WorkerCycleMetricRecord;
  maxDuration: number;
}) {
  const durationWidth = Math.max(10, Math.round((cycle.durationMs / maxDuration) * 100));

  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-emerald-500/25 text-emerald-700 dark:text-emerald-300">
              {cycle.completedMonitors} completed
            </Badge>
            <Badge variant="outline" className="border-border/70 text-muted-foreground">
              Backlog {cycle.backlogAtStart}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {new Date(cycle.cycleFinishedAt).toLocaleString()} / {cycle.successCount} up / {cycle.pendingCount} pending / {cycle.failureCount} down
          </p>
        </div>

        <div className="min-w-52 flex-1 space-y-2 lg:max-w-sm">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Cycle duration</span>
            <span>{cycle.durationMs}ms</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-400" style={{ width: `${durationWidth}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function InsightList({
  title,
  description,
  empty,
  items,
  accent,
}: {
  title: string;
  description: string;
  empty: string;
  items: Array<{
    key: string;
    title: string;
    subtitle: string;
    value: string;
    ratio: number;
    tone: "rose" | "amber";
  }>;
  accent: "rose" | "amber";
}) {
  return (
    <Card className="overflow-hidden border-border/70 bg-background/60">
      <CardHeader
        className={cn(
          "border-b border-border/60 pb-3",
          accent === "rose" && "bg-[linear-gradient(135deg,rgba(244,63,94,0.08),transparent_60%)]",
          accent === "amber" && "bg-[linear-gradient(135deg,rgba(245,158,11,0.08),transparent_60%)]"
        )}
      >
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          items.slice(0, 6).map((item) => (
            <div key={item.key} className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs leading-5 text-muted-foreground">{item.subtitle}</p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">{item.value}</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    item.tone === "rose" && "bg-rose-500",
                    item.tone === "amber" && "bg-amber-500"
                  )}
                  style={{ width: `${Math.min(100, Math.max(10, item.ratio))}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function InlineAlert({ tone, message }: { tone: "danger" | "neutral"; message: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm",
        tone === "danger" && "border-destructive/20 bg-destructive/5 text-destructive",
        tone === "neutral" && "border-border/70 bg-muted/15 text-muted-foreground"
      )}
    >
      <div className="flex items-start gap-2">
        {tone === "danger" ? <ShieldAlert className="mt-0.5 size-4" /> : <AlertTriangle className="mt-0.5 size-4" />}
        <p>{message}</p>
      </div>
    </div>
  );
}

function calculatePressure(value: number, threshold: number) {
  return Math.min(100, Math.max(8, Math.round((value / Math.max(1, threshold)) * 100)));
}

function calculateInversePressure(value: number, threshold: number) {
  if (value <= 0) {
    return 12;
  }

  return Math.min(100, Math.max(12, Math.round((value / Math.max(1, threshold)) * 100)));
}
