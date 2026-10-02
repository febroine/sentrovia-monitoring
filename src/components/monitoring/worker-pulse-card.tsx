"use client";

import { useEffect, useState } from "react";
import { Activity, ChevronDown, Clock, Play, Square, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkerStore } from "@/stores/use-worker-store";
import { sanitizeWorkerStatusMessage } from "@/lib/worker/status-message";
import { formatPanelDateTime } from "@/lib/time";

// A due monitor normally starts within one poll interval; waiting well beyond that means the slots
// are full. The margin keeps the warning quiet at the default 10-second interval.
const MONITOR_WAIT_WARNING_MS = 120_000;
const MONITOR_WAIT_WARNING_MARGIN_MS = 60_000;
// An alert normally goes out within seconds, or about two minutes with a slow site's screenshot.
const NOTIFICATION_WAIT_WARNING_MS = 5 * 60_000;

export function WorkerPulseCard() {
  const { worker, commandLoading, error, loadWorker, toggleWorker } = useWorkerStore();
  const [now, setNow] = useState(() => Date.now());
  const heartbeatAge = worker?.heartbeatAt ? Math.max(0, Math.floor((now - new Date(worker.heartbeatAt).getTime()) / 1000)) : null;
  const stale = worker?.desiredState === "running" && (heartbeatAge === null || heartbeatAge > 180);
  const connectivityOffline = worker?.desiredState === "running" && worker.connectivityStatus === "offline";
  const shouldOfferStop = Boolean(worker?.desiredState === "running" && (worker.running || worker.processAlive));
  const summary = worker?.observability?.summary;
  const oldestDueWaitMs = summary?.oldestDueWaitMs ?? null;
  const waitWarningMs = Math.max(MONITOR_WAIT_WARNING_MS, (worker?.pollIntervalMs ?? 0) + MONITOR_WAIT_WARNING_MARGIN_MS);
  const monitorsWaiting = Boolean(
    worker?.running && !stale && !connectivityOffline && oldestDueWaitMs !== null && oldestDueWaitMs >= waitWarningMs
  );
  const queuedNotifications = summary?.queuedNotifications ?? 0;
  const oldestQueuedNotificationWaitMs = summary?.oldestQueuedNotificationWaitMs ?? null;
  const notificationsWaiting = Boolean(
    worker?.running
      && !stale
      && !connectivityOffline
      && oldestQueuedNotificationWaitMs !== null
      && oldestQueuedNotificationWaitMs >= NOTIFICATION_WAIT_WARNING_MS
  );

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
    <section aria-label="Worker status" className="rounded-lg bg-card/55 p-4">
      <div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">Worker Pulse</p>
              <span
                className={`text-xs font-medium ${
                  connectivityOffline
                    ? "text-destructive"
                    : worker?.running
                    ? "text-emerald-600 dark:text-emerald-400"
                    : stale
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground"
                }`}
              >
                {connectivityOffline ? "Connectivity degraded" : worker?.running ? "Running" : worker?.processAlive ? "Standby" : "Offline"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Heartbeat: {heartbeatAge === null ? "--" : `${heartbeatAge}s ago`}</p>
            </div>
            <details className="group mt-2 text-xs text-muted-foreground">
              <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
                Details <ChevronDown className="size-3 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2 grid gap-x-6 gap-y-2 border-t border-border/70 pt-3 sm:grid-cols-2 xl:grid-cols-[repeat(3,max-content)]">
                <WorkerDetail label="Last cycle" value={formatPanelDateTime(worker?.lastCycleAt)} />
                <WorkerDetail label="PID" value={worker?.processAlive ? String(worker?.pid ?? "--") : "Offline"} />
                <WorkerDetail label="Backlog" value={String(worker?.observability?.summary.dueBacklog ?? 0)} />
                <WorkerDetail label="Cycle duration" value={formatNullableMs(worker?.lastCycleDurationMs)} />
                <WorkerDetail
                  label="Longest wait now"
                  value={oldestDueWaitMs === null ? "None" : formatDuration(oldestDueWaitMs)}
                />
                <WorkerDetail
                  label={`Check delay (${worker?.observability?.range ?? "24h"})`}
                  value={formatCheckDelay(summary?.averageScheduleLagMsInRange, summary?.maxScheduleLagMsInRange)}
                />
                <WorkerDetail
                  label="Alerts waiting"
                  value={formatQueuedNotifications(queuedNotifications, oldestQueuedNotificationWaitMs)}
                />
                <WorkerDetail
                  className="sm:col-span-2 xl:col-span-3"
                  label="Status"
                  value={sanitizeWorkerStatusMessage(error ?? worker?.statusMessage) ?? "Worker status will appear here."}
                />
              </div>
            </details>
            {error ? <p role="alert" className="text-xs text-destructive">{sanitizeWorkerStatusMessage(error)}</p> : null}
          </div>

          <Button
            type="button"
            variant={shouldOfferStop ? "outline" : "default"}
            className={
              shouldOfferStop
                ? "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                : ""
            }
            onClick={() => void toggleWorker()}
            disabled={commandLoading || !worker}
          >
            {shouldOfferStop ? <Square data-icon="inline-start" className="h-4 w-4" /> : <Play data-icon="inline-start" className="h-4 w-4" />}
            {commandLoading ? "Applying..." : shouldOfferStop ? "Stop Worker" : "Start Worker"}
          </Button>
        </div>

        {stale ? (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <Activity className="h-3.5 w-3.5" />
            The worker has not reported a healthy heartbeat recently.
          </div>
        ) : null}
        {monitorsWaiting && oldestDueWaitMs !== null ? (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <Clock className="h-3.5 w-3.5" />
            A due monitor has been waiting {formatDuration(oldestDueWaitMs)} for a free worker slot. If this persists, raise WORKER_CONCURRENCY.
          </div>
        ) : null}
        {notificationsWaiting && oldestQueuedNotificationWaitMs !== null ? (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <Clock className="h-3.5 w-3.5" />
            An alert has been waiting {formatDuration(oldestQueuedNotificationWaitMs)} to be sent. Check the worker log for notification errors.
          </div>
        ) : null}
        {connectivityOffline ? (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <WifiOff className="h-3.5 w-3.5" />
            {worker.connectivityMessage ?? "Internet connectivity is unavailable. Monitor checks, webhook retries, and scheduled reports are paused without changing monitor states."}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function WorkerDetail({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <span className={`min-w-0 ${className}`}>
      <span className="font-medium text-foreground">{label}</span>
      <span className="ml-1 break-words">{value}</span>
    </span>
  );
}

function formatNullableMs(value: number | null | undefined) {
  return typeof value === "number" ? `${value}ms` : "--";
}

function formatDuration(ms: number) {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m ${totalSeconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ${minutes % 60}m` : `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

function formatQueuedNotifications(count: number, oldestWaitMs: number | null) {
  if (count === 0) return "None";
  return oldestWaitMs === null ? String(count) : `${count} (oldest ${formatDuration(oldestWaitMs)})`;
}

function formatCheckDelay(averageMs: number | null | undefined, maxMs: number | null | undefined) {
  if (typeof averageMs !== "number" || typeof maxMs !== "number") return "--";
  return `avg ${formatDuration(averageMs)}, max ${formatDuration(maxMs)}`;
}
