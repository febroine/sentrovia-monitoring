"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Clock3,
  Flame,
  HeartPulse,
  Radar,
  RefreshCw,
  ShieldAlert,
  Siren,
  TimerReset,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  SiteStatus,
  WorkerCycleMetricRecord,
  WorkerObservabilityRange,
} from "@/lib/monitors/types";
import { cn } from "@/lib/utils";
import { useWorkerStore } from "@/stores/use-worker-store";

const REFRESH_INTERVAL_MS = 10_000;
const CYCLE_PAGE_SIZE = 3;
const RANGE_OPTIONS: Array<{
  value: WorkerObservabilityRange;
  label: string;
  hint: string;
}> = [
  { value: "1h", label: "1H", hint: "Recent burst" },
  { value: "24h", label: "24H", hint: "Daily view" },
  { value: "7d", label: "7D", hint: "Weekly drift" },
];

export function WorkerObservabilityDashboard() {
  const { worker, error, loadWorker } = useWorkerStore();
  const [refreshing, setRefreshing] = useState(false);
  const [cyclePage, setCyclePage] = useState(1);
  const [range, setRange] = useState<WorkerObservabilityRange>("24h");

  const observability = worker?.observability ?? null;
  const recentCycles = useMemo(() => observability?.recentCycles ?? [], [observability]);
  const failingMonitors = useMemo(() => observability?.failingMonitors ?? [], [observability]);
  const unstableMonitors = useMemo(() => observability?.unstableMonitors ?? [], [observability]);
  const staleMonitors = useMemo(() => observability?.staleMonitors ?? [], [observability]);
  const failureReasons = useMemo(() => observability?.failureReasons ?? [], [observability]);
  const recentErrors = observability?.recentErrors ?? [];
  const cyclePages = Math.max(1, Math.ceil(recentCycles.length / CYCLE_PAGE_SIZE));
  const visibleCycles = useMemo(
    () => paginateItems(recentCycles, cyclePage, CYCLE_PAGE_SIZE),
    [cyclePage, recentCycles]
  );

  const maxCycleDuration = useMemo(
    () => Math.max(1, ...recentCycles.map((cycle) => cycle.durationMs)),
    [recentCycles]
  );

  const maxFailingCount = useMemo(
    () => Math.max(1, ...failingMonitors.map((monitor) => monitor.failureCount)),
    [failingMonitors]
  );
  const maxTransitionCount = useMemo(
    () => Math.max(1, ...unstableMonitors.map((monitor) => monitor.transitionCount)),
    [unstableMonitors]
  );
  const maxFailureReasonCount = useMemo(
    () => Math.max(1, ...failureReasons.map((reason) => reason.count)),
    [failureReasons]
  );

  const refreshDashboard = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) {
      setRefreshing(true);
    }

    try {
      await loadWorker(range);
    } finally {
      if (showSpinner) {
        setRefreshing(false);
      }
    }
  }, [loadWorker, range]);

  useEffect(() => {
    void refreshDashboard(false);
    const intervalId = window.setInterval(() => void refreshDashboard(false), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [refreshDashboard]);

  useEffect(() => {
    setCyclePage(1);
  }, [range]);

  useEffect(() => {
    setCyclePage((current) => Math.min(current, cyclePages));
  }, [cyclePages]);

  return (
    <Card className="overflow-hidden border-border/70 bg-card">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-sky-500/25 text-sky-700 dark:text-sky-300">
                Worker Insights
              </Badge>
              <Badge variant="outline" className="border-border/70 text-muted-foreground">
                {resolveRangeTitle(range)}
              </Badge>
            </div>
            <div className="space-y-1">
              <CardTitle className="text-lg">Observability Dashboard</CardTitle>
              <CardDescription className="max-w-3xl">
                Backlog pressure, cycle quality, failure causes, and runtime drift in one operator-ready view.
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:items-end">
            <div className="flex flex-wrap gap-2">
              {RANGE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={range === option.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setRange(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void refreshDashboard(true)}>
              <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
              Refresh insights
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        {error ? (
          <InlineAlert tone="danger" message={error} />
        ) : null}

        {!observability ? (
          <InlineAlert
            tone="neutral"
            message="Worker insight metrics will appear here after the runner completes a few scheduler cycles."
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
                label={`Checks / ${resolveRangeMetric(range)}`}
                value={String(observability.summary.checksInRange)}
                detail="Settled checks in the selected window"
                tone="emerald"
              />
              <InsightMetric
                icon={Flame}
                label={`Failures / ${resolveRangeMetric(range)}`}
                value={String(observability.summary.failuresInRange)}
                detail="Failure count in the selected window"
                tone="rose"
              />
              <InsightMetric
                icon={Clock3}
                label={`Avg latency / ${resolveRangeMetric(range)}`}
                value={`${observability.summary.averageLatencyMsInRange}ms`}
                detail="Average response time across sampled checks"
                tone="amber"
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <SignalCard
                    title="Cycle health"
                    subtitle="Latest scheduler pass with success, pending, and failure mix."
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
                    footer={
                      observability.summary.lastCycleDurationMs === null
                        ? "No completed cycle yet."
                        : `Last cycle ${observability.summary.lastCycleDurationMs} ms · ${observability.summary.lastCycleMonitorCount} claimed`
                    }
                  />

                  <SignalCard
                    title="Pressure bars"
                    subtitle="Fast read on queue backlog, failure load, and scheduler pace."
                    rows={[
                      {
                        label: "Backlog pressure",
                        value: `${observability.summary.dueBacklog}`,
                        tone: "sky",
                        barValue: calculatePressure(observability.summary.dueBacklog, 40),
                      },
                      {
                        label: "Failure pressure",
                        value: `${observability.summary.failuresInRange}`,
                        tone: "rose",
                        barValue: calculatePressure(observability.summary.failuresInRange, 25),
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
                    footer={`Last cycle avg latency ${observability.summary.lastCycleAverageLatencyMs ?? 0} ms`}
                  />
                </div>

                <TrendPanel trend={observability.trend} range={observability.range} />

                <Card className="border-border/70 bg-background/60">
                  <CardHeader className="border-b border-border/60 pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <CardTitle className="text-base">Recent cycles</CardTitle>
                        <CardDescription>
                          Each line shows cycle duration, backlog at start, and outcome mix.
                        </CardDescription>
                      </div>
                      <CyclePager
                        page={cyclePage}
                        totalPages={cyclePages}
                        onPrevious={() => setCyclePage((current) => Math.max(1, current - 1))}
                        onNext={() => setCyclePage((current) => Math.min(cyclePages, current + 1))}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-4">
                    {recentCycles.length === 0 ? (
                      <EmptyState
                        title="No cycle history yet"
                        description="The worker needs a few passes before recent cycle telemetry becomes useful."
                        icon={TimerReset}
                      />
                    ) : (
                      visibleCycles.map((cycle) => (
                        <CycleRow key={cycle.id} cycle={cycle} maxDuration={maxCycleDuration} />
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <InsightList
                  title="Failing monitors"
                  description="Services with the highest failure count in the selected time window."
                  empty="No monitor failures recorded in this range."
                  items={failingMonitors.map((monitor) => ({
                    key: monitor.monitorId,
                    title: monitor.name,
                    subtitle: monitor.lastFailureAt
                      ? `Last failure ${new Date(monitor.lastFailureAt).toLocaleString()}`
                      : "No timestamp recorded",
                    value: `${monitor.failureCount} failures`,
                    ratio: Math.max(12, (monitor.failureCount / maxFailingCount) * 100),
                    tone: "rose",
                    badge: resolveStatusLabel(monitor.status),
                  }))}
                />

                <InsightList
                  title="Unstable monitors"
                  description="Endpoints that changed state the most during the selected window."
                  empty="No status flapping detected in this range."
                  items={unstableMonitors.map((monitor) => ({
                    key: monitor.monitorId,
                    title: monitor.name,
                    subtitle: monitor.lastStatusChangeAt
                      ? `Last transition ${new Date(monitor.lastStatusChangeAt).toLocaleString()}`
                      : "No transition timestamp",
                    value: `${monitor.transitionCount} changes`,
                    ratio: Math.max(12, (monitor.transitionCount / maxTransitionCount) * 100),
                    tone: "amber",
                    badge: resolveStatusLabel(monitor.status),
                  }))}
                />

                <InsightList
                  title="Stale monitors"
                  description="Monitors that have gone too long without a fresh check."
                  empty="No stale monitors in the selected range."
                  items={staleMonitors.map((monitor) => ({
                    key: monitor.monitorId,
                    title: monitor.name,
                    subtitle: monitor.lastCheckedAt
                      ? `Last check ${new Date(monitor.lastCheckedAt).toLocaleString()}`
                      : "Never checked yet",
                    value:
                      monitor.minutesSinceLastCheck === null
                        ? "No check"
                        : `${monitor.minutesSinceLastCheck} min idle`,
                    ratio: calculatePressure(monitor.minutesSinceLastCheck ?? 0, 90),
                    tone: "sky",
                    badge: resolveStatusLabel(monitor.status),
                  }))}
                />

                <InsightList
                  title="Failure reasons"
                  description="Most common RCA buckets driving outages in this window."
                  empty="No classified failure reasons recorded."
                  items={failureReasons.map((reason) => ({
                    key: reason.reason,
                    title: reason.reason,
                    subtitle: "Runtime root-cause bucket",
                    value: `${reason.count} events`,
                    ratio: Math.max(12, (reason.count / maxFailureReasonCount) * 100),
                    tone: "rose",
                  }))}
                />

                <InsightList
                  title="Recent worker errors"
                  description="Cycle-level failures that blocked or degraded the scheduler."
                  empty="No worker-level cycle errors recorded."
                  items={recentErrors.map((errorItem, index) => ({
                    key: `${errorItem.createdAt}-${index}`,
                    title: new Date(errorItem.createdAt).toLocaleString(),
                    subtitle: errorItem.message,
                    value: "Worker error",
                    ratio: 100,
                    tone: "amber",
                  }))}
                />

                <WorkerSummaryPanel
                  backlog={observability.summary.dueBacklog}
                  checksInRange={observability.summary.checksInRange}
                  failureCount={observability.summary.failuresInRange}
                  lastCycleDurationMs={observability.summary.lastCycleDurationMs}
                  averageLatencyMs={observability.summary.averageLatencyMsInRange}
                  lastHeartbeatAt={worker?.heartbeatAt ?? null}
                  range={observability.range}
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
}) {
  return (
    <Card className="overflow-hidden border-border/70 bg-background/60">
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

function TrendPanel({
  trend,
  range,
}: {
  trend: Array<{
    label: string;
    checks: number;
    failures: number;
    averageCycleDurationMs: number;
  }>;
  range: WorkerObservabilityRange;
}) {
  const maxChecks = Math.max(1, ...trend.map((point) => point.checks));
  const maxFailures = Math.max(1, ...trend.map((point) => point.failures));

  return (
    <Card className="overflow-hidden border-border/70 bg-background/60">
      <CardHeader className="border-b border-border/60 pb-3">
        <CardTitle className="text-base">Runtime trend</CardTitle>
        <CardDescription>
          Check volume and failure drift across the {resolveRangeTitle(range).toLowerCase()} window.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {trend.length === 0 ? (
          <EmptyState
            title="No trend data yet"
            description="Once the worker records enough checks, this panel will show throughput and failure movement."
            icon={TrendingUp}
          />
        ) : (
          trend.map((point) => (
            <div key={point.label} className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">{point.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Avg cycle {point.averageCycleDurationMs} ms
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="border-border/70">
                    {point.checks} checks
                  </Badge>
                  <Badge variant="outline" className="border-border/70">
                    {point.failures} failures
                  </Badge>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <TrendRow
                  label="Checks"
                  value={point.checks}
                  width={Math.max(8, (point.checks / maxChecks) * 100)}
                  tone="sky"
                />
                <TrendRow
                  label="Failures"
                  value={point.failures}
                  width={point.failures === 0 ? 8 : Math.max(8, (point.failures / maxFailures) * 100)}
                  tone="rose"
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function TrendRow({
  label,
  value,
  width,
  tone,
}: {
  label: string;
  value: number;
  width: number;
  tone: "sky" | "rose";
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", tone === "sky" ? "bg-sky-500" : "bg-rose-500")}
          style={{ width: `${Math.min(100, width)}%` }}
        />
      </div>
    </div>
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
    tone: "sky" | "rose" | "amber";
    badge?: string;
  }>;
}) {
  return (
    <Card className="overflow-hidden border-border/70 bg-background/60">
      <CardHeader className="border-b border-border/60 pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {items.length === 0 ? (
          <EmptyState title="Nothing to surface" description={empty} icon={Siren} />
        ) : (
          items.slice(0, 6).map((item) => (
            <div key={item.key} className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{item.title}</p>
                    {item.badge ? (
                      <Badge variant="outline" className="border-border/70 text-muted-foreground">
                        {item.badge}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">{item.subtitle}</p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">{item.value}</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    item.tone === "sky" && "bg-sky-500",
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

function WorkerSummaryPanel({
  backlog,
  checksInRange,
  failureCount,
  lastCycleDurationMs,
  averageLatencyMs,
  lastHeartbeatAt,
  range,
}: {
  backlog: number;
  checksInRange: number;
  failureCount: number;
  lastCycleDurationMs: number | null;
  averageLatencyMs: number;
  lastHeartbeatAt: string | null;
  range: WorkerObservabilityRange;
}) {
  return (
    <Card className="overflow-hidden border-border/70 bg-background/60">
      <CardHeader className="border-b border-border/60 pb-3">
        <CardTitle className="text-base">Worker summary</CardTitle>
        <CardDescription>Quick reading cues for operator focus without leaving this screen.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
        <SummaryMiniCard
          icon={HeartPulse}
          label="Last heartbeat"
          value={lastHeartbeatAt ? new Date(lastHeartbeatAt).toLocaleString() : "Not reported yet"}
        />
        <SummaryMiniCard
          icon={Clock3}
          label={`Avg latency / ${resolveRangeMetric(range)}`}
          value={`${averageLatencyMs} ms`}
        />
        <SummaryMiniCard
          icon={Radar}
          label="Backlog focus"
          value={backlog > 0 ? `${backlog} due checks waiting` : "Queue is clear"}
        />
        <SummaryMiniCard
          icon={Flame}
          label="Failure pressure"
          value={failureCount > 0 ? `${failureCount} failures in range` : "No failure pressure right now"}
        />
        <SummaryMiniCard
          icon={BarChart3}
          label={`Throughput / ${resolveRangeMetric(range)}`}
          value={`${checksInRange} settled checks`}
        />
        <SummaryMiniCard
          icon={TimerReset}
          label="Last cycle pace"
          value={lastCycleDurationMs === null ? "Not recorded yet" : `${lastCycleDurationMs} ms`}
        />
      </CardContent>
    </Card>
  );
}

function EmptyState({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/10 px-4 py-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-border/70 bg-background/80 p-2.5">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

function SummaryMiniCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl border border-border/70 bg-muted/15 p-2.5">
          <Icon className="size-4 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="text-sm leading-6">{value}</p>
        </div>
      </div>
    </div>
  );
}

function CyclePager({
  page,
  totalPages,
  onPrevious,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Button type="button" variant="outline" size="sm" onClick={onPrevious} disabled={page === 1}>
        Previous
      </Button>
      <span>
        {page} / {totalPages}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onNext} disabled={page === totalPages}>
        Next
      </Button>
    </div>
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

function resolveRangeMetric(range: WorkerObservabilityRange) {
  if (range === "1h") {
    return "hour";
  }

  if (range === "7d") {
    return "7d";
  }

  return "24h";
}

function resolveRangeTitle(range: WorkerObservabilityRange) {
  if (range === "1h") {
    return "Last hour";
  }

  if (range === "7d") {
    return "Last 7 days";
  }

  return "Last 24 hours";
}

function resolveStatusLabel(status: SiteStatus) {
  if (status === "down") {
    return "Down";
  }

  if (status === "pending") {
    return "Pending";
  }

  return "Up";
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

function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
