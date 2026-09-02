"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type {
  MonitorDiagnosticRecord,
  MonitorHistoryPoint,
  MonitorOutageEventRecord,
  MonitorRecord,
} from "@/lib/monitors/types";
import { buildMonitorHistoryWindow } from "@/lib/monitors/history-window";
import { toEnglishUppercase } from "@/lib/text/casing";

export function MonitorHistoryDialog({
  open,
  monitor,
  points,
  diagnostics,
  outageEvents,
  selectedPointId,
  onSelectPoint,
  onOpenChange,
}: {
  open: boolean;
  monitor: MonitorRecord | null;
  points: MonitorHistoryPoint[];
  diagnostics: MonitorDiagnosticRecord[];
  outageEvents: MonitorOutageEventRecord[];
  selectedPointId: string | null;
  onSelectPoint: (pointId: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const selection = buildMonitorHistoryWindow(points, selectedPointId);
  const latestDiagnostic = diagnostics.length > 0 ? diagnostics[diagnostics.length - 1] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Timeline details</DialogTitle>
          <DialogDescription>
            {monitor ? `${monitor.name} · ${monitor.url}` : "Review the selected monitor check window."}
          </DialogDescription>
        </DialogHeader>

        {!monitor || !selection ? (
          <div className="border-l-2 border-border px-4 py-4 text-sm text-muted-foreground">
            Select a timeline point to inspect its state window.
          </div>
        ) : (
          <div className="space-y-4">
            <dl className="grid border-y md:grid-cols-2 xl:grid-cols-4 xl:divide-x">
              <HistoryStat
                label="State"
                value={getStateLabel(selection.point.status)}
                helper={getStateHelper(selection.point.status)}
              />
              <HistoryStat
                label="Observed span"
                value={formatDuration(selection.observedDurationMs)}
                helper="Based only on completed checks"
              />
              <HistoryStat
                label="Status code"
                value={selection.point.statusCode ? `HTTP ${selection.point.statusCode}` : "--"}
                helper="Response seen in this check"
              />
              <HistoryStat
                label="Latency"
                value={selection.point.latencyMs ? `${selection.point.latencyMs}ms` : "--"}
                helper="Measured response time"
              />
            </dl>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
              <div className="border-y py-4">
                <p className="text-sm font-medium">Selected check and state window</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Consecutive completed checks with the same state are grouped here. This is not a running request.
                </p>
                <div className="mt-4 space-y-3 text-sm">
                  <DetailRow label="Selected check at" value={formatDateTime(selection.point.createdAt)} />
                  <DetailRow label="First shown check" value={formatDateTime(selection.windowStart.createdAt)} />
                  <DetailRow label="Latest completed check" value={formatDateTime(selection.latestWindowPoint.createdAt)} />
                  <DetailRow
                    label="Window state"
                    value={formatWindowState(selection)}
                  />
                  <DetailRow label="Completed checks" value={String(selection.windowPoints.length)} />
                  <DetailRow label="Current monitor status" value={getCurrentMonitorStatusLabel(monitor)} />
                  <DetailRow label="Next scheduled check" value={getNextCheckLabel(monitor)} />
                </div>
              </div>

              <div className="border-y py-4">
                <p className="text-sm font-medium">State summary</p>
                <p className="mt-1 text-xs text-muted-foreground">{buildStateSummary(selection, monitor)}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {points.map((point) => (
                    <button
                      type="button"
                      key={point.id}
                      className={[
                        "h-3 w-6 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                        point.status === "up"
                          ? "border-emerald-500/30 bg-emerald-500/80"
                          : point.status === "pending"
                            ? "border-amber-500/30 bg-amber-500/80"
                            : "border-destructive/30 bg-destructive/80",
                        point.id === selection.point.id ? "scale-110 ring-2 ring-ring/50" : "opacity-70",
                      ].join(" ")}
                      title={`${toEnglishUppercase(point.status)} · ${formatDateTime(point.createdAt)}`}
                      aria-label={`Select ${toEnglishUppercase(point.status)} check at ${formatDateTime(point.createdAt)}`}
                      aria-pressed={point.id === selection.point.id}
                      onClick={() => onSelectPoint(point.id)}
                    />
                  ))}
                </div>
                <div className="mt-4 space-y-2">
                  {selection.previousPoint ? (
                    <DetailRow label="Previous state" value={`${toEnglishUppercase(selection.previousPoint.status)} at ${formatDateTime(selection.previousPoint.createdAt)}`} />
                  ) : null}
                  {selection.nextPoint ? (
                    <DetailRow label="Next change" value={`${toEnglishUppercase(selection.nextPoint.status)} at ${formatDateTime(selection.nextPoint.createdAt)}`} />
                  ) : (
                    <DetailRow label="Next change" value="No later state change in the current timeline window" />
                  )}
                </div>
              </div>
            </div>

            {latestDiagnostic ? (
              <div className="border-y py-4">
                <p className="text-sm font-medium">Latest diagnostics</p>
                <p className="mt-1 text-xs text-muted-foreground">{latestDiagnostic.summary}</p>
                <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <DiagnosticPill label="DNS" value={formatStepStatus(latestDiagnostic.dnsStatus)} />
                  <DiagnosticPill label="TCP" value={formatStepStatus(latestDiagnostic.tcpStatus)} />
                  <DiagnosticPill label="TLS" value={formatStepStatus(latestDiagnostic.tlsStatus)} />
                  <DiagnosticPill
                    label="HTTP"
                    value={latestDiagnostic.httpStatusCode ? `HTTP ${latestDiagnostic.httpStatusCode}` : formatStepStatus(latestDiagnostic.httpStatus)}
                  />
                </div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                  <span>Failed phase: {latestDiagnostic.failedPhase ?? "--"}</span>
                  <span>Category: {latestDiagnostic.failureCategory ?? "--"}</span>
                  <span>Timeout: {latestDiagnostic.timeoutMs}ms</span>
                  <span className="md:col-span-3">Resolved IPs: {latestDiagnostic.resolvedIps.length > 0 ? latestDiagnostic.resolvedIps.join(", ") : "--"}</span>
                  {latestDiagnostic.errorMessage ? <span className="md:col-span-3">Error: {latestDiagnostic.errorMessage}</span> : null}
                </div>
              </div>
            ) : null}

            {outageEvents.length > 0 ? (
              <div className="border-y py-4">
                <p className="text-sm font-medium">Outage timeline</p>
                <div className="mt-3 divide-y">
                  {outageEvents.map((event) => (
                    <div key={event.id} className="py-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-medium">{event.title}</p>
                        <span className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</span>
                      </div>
                      {event.detail ? <p className="mt-1 text-xs text-muted-foreground">{event.detail}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="border-y py-4">
              <p className="text-sm font-medium">Recent state flow</p>
              <div className="mt-3 divide-y">
                {points.map((point) => (
                  <button
                    type="button"
                    key={point.id}
                    className={[
                      "flex w-full items-center justify-between py-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      point.id === selection.point.id ? "bg-primary/5" : "",
                    ].join(" ")}
                    aria-pressed={point.id === selection.point.id}
                    onClick={() => onSelectPoint(point.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={[
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                          point.status === "up"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : point.status === "pending"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : "bg-destructive/10 text-destructive",
                        ].join(" ")}
                      >
                        {toEnglishUppercase(point.status)}
                      </span>
                      <span className="text-muted-foreground">{formatDateTime(point.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{point.statusCode ? `HTTP ${point.statusCode}` : "No code"}</span>
                      <span>{point.latencyMs ? `${point.latencyMs}ms` : "--"}</span>
                    </div>
                  </button>
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
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="border-b px-4 py-3 last:border-b-0 xl:border-b-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="pt-2 text-sm font-semibold text-foreground">{value}</dd>
      <p className="pt-1 text-xs text-muted-foreground">{helper}</p>
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

function DiagnosticPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-border py-1 pl-3">
      <p className="font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function buildStateSummary(
  selection: NonNullable<ReturnType<typeof buildMonitorHistoryWindow>>,
  monitor: MonitorRecord
) {
  const durationLabel = formatDuration(selection.observedDurationMs);

  if (!monitor.isActive) {
    return `This monitor is paused. Completed checks in the selected window span ${durationLabel}.`;
  }

  if (selection.point.status === "pending") {
    return `Completed verification checks in this window span ${durationLabel}. ${
      monitor.verificationMode
        ? `The worker is still confirming the outage (${monitor.verificationFailureCount}/${Math.max(1, monitor.retries)} attempts).`
        : "The monitor later returned to a confirmed state."
    }`;
  }

  if (selection.point.status === "up") {
    return `Completed healthy checks in this window span ${durationLabel}. ${
      monitor.verificationMode ? "It is currently in verification mode after a recent anomaly." : "No failure confirmation is active right now."
    }`;
  }

  return `Completed failed checks in this window span ${durationLabel}. ${
    monitor.verificationMode
      ? `Verification is still running (${monitor.verificationFailureCount}/${Math.max(1, monitor.retries)} attempts).`
      : "This state has already been confirmed as an outage."
  }`;
}

function getCurrentMonitorStatusLabel(monitor: MonitorRecord) {
  if (!monitor.isActive) {
    return "Paused";
  }

  return monitor.verificationMode ? "Verification mode" : toEnglishUppercase(monitor.status);
}

function getNextCheckLabel(monitor: MonitorRecord) {
  if (!monitor.isActive) {
    return "Paused";
  }

  return monitor.nextCheckAt ? formatDateTime(monitor.nextCheckAt) : "Awaiting schedule";
}

function getStateLabel(status: MonitorHistoryPoint["status"]) {
  if (status === "pending") {
    return "Verifying";
  }

  return status === "up" ? "Online" : "Offline";
}

function getStateHelper(status: MonitorHistoryPoint["status"]) {
  if (status === "pending") {
    return "Pending confirmation window";
  }

  return status === "up" ? "Healthy check window" : "Failure window";
}

function formatStepStatus(status: string | null) {
  if (!status) {
    return "--";
  }

  return toEnglishUppercase(status);
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatWindowState(
  selection: NonNullable<ReturnType<typeof buildMonitorHistoryWindow>>
) {
  if (selection.isOngoing || !selection.nextPoint) {
    return "Ongoing (latest recorded state)";
  }

  return `Ended at ${formatDateTime(selection.nextPoint.createdAt)}`;
}

function formatDuration(durationMs: number) {
  if (durationMs < 60_000) {
    return "<1m";
  }

  const totalMinutes = Math.floor(durationMs / 60_000);
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
