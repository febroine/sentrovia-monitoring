"use client";

import { Activity, ArrowRight, CheckCircle2, Clock3, ShieldAlert, TimerReset } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MonitorHistoryPoint, MonitorRecord } from "@/lib/monitors/types";

export function MonitorHistoryDialog({
  open,
  monitor,
  points,
  selectedPointId,
  onOpenChange,
}: {
  open: boolean;
  monitor: MonitorRecord | null;
  points: MonitorHistoryPoint[];
  selectedPointId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const selection = buildSelection(points, selectedPointId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Timeline details</DialogTitle>
          <DialogDescription>
            {monitor ? `${monitor.name} · ${monitor.url}` : "Review the selected monitor check window."}
          </DialogDescription>
        </DialogHeader>

        {!monitor || !selection ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-4 py-6 text-sm text-muted-foreground">
            Select a timeline point to inspect its state window.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <HistoryStat
                label="State"
                value={selection.point.status === "up" ? "Online" : "Offline"}
                helper={selection.point.status === "up" ? "Healthy check window" : "Failure window"}
                accent={selection.point.status === "up" ? "before:bg-emerald-500" : "before:bg-destructive"}
                icon={selection.point.status === "up" ? CheckCircle2 : ShieldAlert}
              />
              <HistoryStat
                label="Window length"
                value={selection.durationLabel}
                helper="Continuous state duration"
                accent="before:bg-sky-500"
                icon={Clock3}
              />
              <HistoryStat
                label="Status code"
                value={selection.point.statusCode ? `HTTP ${selection.point.statusCode}` : "--"}
                helper="Response seen in this check"
                accent="before:bg-amber-500"
                icon={Activity}
              />
              <HistoryStat
                label="Latency"
                value={selection.point.latencyMs ? `${selection.point.latencyMs}ms` : "--"}
                helper="Measured response time"
                accent="before:bg-violet-500"
                icon={TimerReset}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
              <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                <p className="text-sm font-medium">Selected window</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This range covers the uninterrupted period where the monitor stayed in the same state.
                </p>
                <div className="mt-4 space-y-3 text-sm">
                  <DetailRow label="Started at" value={formatDateTime(selection.windowStart.createdAt)} />
                  <DetailRow label="Ended at" value={selection.windowEnd ? formatDateTime(selection.windowEnd.createdAt) : "Current latest check"} />
                  <DetailRow label="Checks in window" value={String(selection.windowPoints.length)} />
                  <DetailRow label="Current monitor status" value={monitor.verificationMode ? "Verification mode" : monitor.status.toUpperCase()} />
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
                <p className="text-sm font-medium">State summary</p>
                <p className="mt-1 text-xs text-muted-foreground">{buildStateSummary(selection, monitor)}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {points.map((point) => (
                    <div
                      key={point.id}
                      className={[
                        "h-3 w-6 rounded-full border transition",
                        point.status === "up"
                          ? "border-emerald-500/30 bg-emerald-500/80"
                          : "border-destructive/30 bg-destructive/80",
                        point.id === selection.point.id ? "scale-110 ring-2 ring-ring/50" : "opacity-70",
                      ].join(" ")}
                      title={`${point.status.toUpperCase()} · ${formatDateTime(point.createdAt)}`}
                    />
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {selection.previousPoint ? (
                    <DetailRow label="Previous state" value={`${selection.previousPoint.status.toUpperCase()} at ${formatDateTime(selection.previousPoint.createdAt)}`} />
                  ) : null}
                  {selection.nextPoint ? (
                    <DetailRow label="Next change" value={`${selection.nextPoint.status.toUpperCase()} at ${formatDateTime(selection.nextPoint.createdAt)}`} />
                  ) : (
                    <DetailRow label="Next change" value="No later state change in the current timeline window" />
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
              <div className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-sky-500" />
                <p className="text-sm font-medium">Recent state flow</p>
              </div>
              <div className="mt-3 space-y-2">
                {points.map((point) => (
                  <div
                    key={point.id}
                    className={[
                      "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                      point.id === selection.point.id ? "border-primary/40 bg-primary/5" : "border-border/70 bg-background/70",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={[
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                          point.status === "up"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-destructive/10 text-destructive",
                        ].join(" ")}
                      >
                        {point.status.toUpperCase()}
                      </span>
                      <span className="text-muted-foreground">{formatDateTime(point.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{point.statusCode ? `HTTP ${point.statusCode}` : "No code"}</span>
                      <span>{point.latencyMs ? `${point.latencyMs}ms` : "--"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HistoryStat({
  label,
  value,
  helper,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper: string;
  accent: string;
  icon: typeof CheckCircle2;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-border/70 bg-background/75 px-4 py-3 before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-full ${accent}`}
    >
      <div className="flex items-center gap-2 pl-3">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      </div>
      <p className="pl-3 pt-2 text-sm font-semibold text-foreground">{value}</p>
      <p className="pl-3 pt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 last:border-b-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function buildSelection(points: MonitorHistoryPoint[], selectedPointId: string | null) {
  if (!selectedPointId) {
    return null;
  }

  const index = points.findIndex((point) => point.id === selectedPointId);
  if (index === -1) {
    return null;
  }

  const point = points[index];
  let startIndex = index;
  while (startIndex > 0 && points[startIndex - 1]?.status === point.status) {
    startIndex -= 1;
  }

  let endIndex = index;
  while (endIndex < points.length - 1 && points[endIndex + 1]?.status === point.status) {
    endIndex += 1;
  }

  const windowStart = points[startIndex];
  const windowEnd = endIndex < points.length - 1 ? points[endIndex + 1] : null;
  const currentWindowEnd = windowEnd ? new Date(windowEnd.createdAt) : new Date();
  const durationMs = Math.max(0, currentWindowEnd.getTime() - new Date(windowStart.createdAt).getTime());

  return {
    point,
    previousPoint: startIndex > 0 ? points[startIndex - 1] : null,
    nextPoint: endIndex < points.length - 1 ? points[endIndex + 1] : null,
    windowStart,
    windowEnd,
    windowPoints: points.slice(startIndex, endIndex + 1),
    durationLabel: formatDuration(durationMs),
  };
}

function buildStateSummary(
  selection: NonNullable<ReturnType<typeof buildSelection>>,
  monitor: MonitorRecord
) {
  if (selection.point.status === "up") {
    return `The monitor remained healthy for ${selection.durationLabel}. ${
      monitor.verificationMode ? "It is currently in verification mode after a recent anomaly." : "No failure confirmation is active right now."
    }`;
  }

  return `The monitor stayed down for ${selection.durationLabel}. ${
    monitor.verificationMode
      ? `Verification is still running (${monitor.verificationFailureCount}/${Math.max(1, monitor.retries)} attempts).`
      : "This state has already been confirmed as an outage."
  }`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatDuration(durationMs: number) {
  const totalMinutes = Math.max(1, Math.round(durationMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}
