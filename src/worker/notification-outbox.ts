import { db } from "@/lib/db";
import type { Monitor, NotificationJob } from "@/lib/db/schema";
import { hasAcceptedNotificationDeliverySince } from "@/lib/delivery/service";
import { env } from "@/lib/env";
import type { RootCauseAnalysis } from "@/lib/monitoring/rca";
import { appendMonitorEvent, withMonitorHistoryLock } from "@/lib/monitors/service";
import {
  claimNotificationJobs,
  completeNotificationJob,
  enqueueNotificationJob,
  failNotificationJob,
  hasOpenNotificationJob,
  isNotificationJobOwned,
  lockOwnedNotificationJob,
  markNotificationDeliveryStarted,
  MAX_NOTIFICATION_JOB_ATTEMPTS,
  NOTIFICATION_JOB_CLAIM_MS,
} from "@/lib/notifications/outbox";
import { canUserAccessPrivateTargets } from "@/lib/security/network-policy";
import { decryptValue, encryptValue } from "@/lib/security/encryption";
import type { NotificationLanguage } from "@/lib/settings/types";
import { evaluateNotificationDecision, sendMonitorNotifications } from "@/worker/notifier";
import { buildFailureScreenshotAttachment } from "@/worker/screenshot";
import type { CheckResult, NotificationContext } from "@/worker/types";

type NotificationKind = Exclude<NotificationContext["kind"], "check">;

// Monitor events recorded once the alert was handed to a channel; the notification decision reads them
// to deduplicate later alerts.
export type NotificationMarker = {
  eventType: string;
  status: "up" | "down" | "pending";
};

export type QueuedNotification = {
  kind: NotificationKind;
  message: string;
  monitor: Monitor;
  result: CheckResult;
  rca: RootCauseAnalysis;
  markers: NotificationMarker[];
  // Attach a screenshot of the site, taken when the alert is sent.
  captureScreenshot?: boolean;
};

type NotificationJobPayload = Omit<QueuedNotification, "captureScreenshot"> & {
  version: 1;
  captureScreenshot: boolean;
};

// One waiting alert per monitor is enough for these: a second outage alert or reminder raised while
// the first is still queued would repeat it. Recoveries and status changes each describe a distinct
// transition and are always queued.
const DEDUPLICATED_KINDS = new Set<NotificationKind>(["failure", "downtime-reminder", "latency", "ssl-expiry"]);
const NOTIFICATION_WAKE_DELAY_MS = 100;
// A job running this long is stuck; its slot is freed before its claim expires and it is taken over.
const NOTIFICATION_JOB_WATCHDOG_MS = NOTIFICATION_JOB_CLAIM_MS - 60_000;

// Queues the alert when the notification settings allow it. Returns whether an alert is now on its way
// (queued now or already waiting), so the check can skip alerts that the queued one makes redundant.
export async function queueMonitorNotification(notification: QueuedNotification) {
  const decision = await evaluateNotificationDecision(notification);
  if (!decision.wouldNotify) {
    return false;
  }

  const outcome = await enqueueNotificationJob({
    workspaceId: notification.monitor.workspaceId,
    userId: notification.monitor.userId,
    monitorId: notification.monitor.id,
    kind: notification.kind,
    dedupeKey: DEDUPLICATED_KINDS.has(notification.kind) ? notification.kind : null,
    payload: encodeNotificationJobPayload({
      version: 1,
      kind: notification.kind,
      message: notification.message,
      monitor: notification.monitor,
      result: notification.result,
      rca: notification.rca,
      markers: notification.markers,
      captureScreenshot: notification.captureScreenshot === true,
    }),
    checkedAt: notification.result.checkedAt,
  });
  if (outcome === "queued") {
    wakeNotificationDispatch();
  }

  return true;
}

export function hasQueuedNotification(monitorId: string, kind: NotificationKind) {
  return hasOpenNotificationJob(monitorId, kind);
}

export async function processNotificationJob(job: NotificationJob) {
  const payload = decodeNotificationJobPayload(job.payload);
  if (!payload) {
    await failNotificationJob(job, "The queued notification could not be read.", { permanent: true });
    return;
  }
  // Claims count attempts, so a job that keeps crashing its worker is given up as well.
  if (job.attempts > MAX_NOTIFICATION_JOB_ATTEMPTS) {
    await failNotificationJob(job, `Gave up after ${MAX_NOTIFICATION_JOB_ATTEMPTS} attempts.`, { permanent: true });
    return;
  }

  try {
    const sent = await deliverNotificationJob(job, payload);
    await finishNotificationJob(job, payload, sent);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The notification could not be sent.";
    console.error(`[sentrovia] Notification job ${job.id} for monitor ${job.monitorId} failed.`, error);
    await failNotificationJob(job, message).catch((failError) => {
      console.error(`[sentrovia] Unable to reschedule notification job ${job.id}.`, failError);
    });
  }
}

async function deliverNotificationJob(job: NotificationJob, payload: NotificationJobPayload) {
  // A worker that stopped mid-delivery leaves its deliveries behind; sending again would repeat them.
  if (job.deliveryStartedAt && await hasAcceptedNotificationDeliverySince({
    monitorId: job.monitorId,
    kind: payload.kind,
    since: job.deliveryStartedAt,
  })) {
    return true;
  }

  const monitor = await refreshPrivateTargetAccess(payload.monitor);
  await markNotificationDeliveryStarted(job);
  return sendMonitorNotifications({
    kind: payload.kind,
    message: payload.message,
    monitor,
    result: payload.result,
    rca: payload.rca,
    buildEmailAttachments: payload.captureScreenshot
      ? (language) => captureAlertScreenshot(job, monitor, payload.result, language)
      : undefined,
  });
}

// The markers are dated at the check that raised the alert: a later check deduplicates against them
// even when this job finished after that check started.
async function finishNotificationJob(job: NotificationJob, payload: NotificationJobPayload, sent: boolean) {
  await withMonitorHistoryLock(job.monitorId, () => db.transaction(async (tx) => {
    if (!(await lockOwnedNotificationJob(tx, job))) {
      return;
    }

    if (sent) {
      for (const marker of payload.markers) {
        await appendMonitorEvent({
          monitorId: job.monitorId,
          userId: job.userId,
          eventType: marker.eventType,
          status: marker.status,
          statusCode: payload.result.statusCode,
          latencyMs: payload.result.latencyMs,
          message: payload.message,
          rcaType: payload.rca.type,
          rcaTitle: payload.rca.title,
          rcaSummary: payload.rca.summary,
          createdAt: payload.result.checkedAt,
        }, tx);
      }
    }
    await completeNotificationJob(tx, job, sent ? "sent" : "skipped");
  }));
}

async function refreshPrivateTargetAccess(monitor: Monitor) {
  const claimed = monitor as Monitor & { allowPrivateTargets?: boolean };
  if (claimed.allowPrivateTargets !== true) {
    return monitor;
  }

  // The alert may be sent a while after the check; the owner may have lost private-network access.
  const allowPrivateTargets = await canUserAccessPrivateTargets(monitor.userId, undefined, monitor.workspaceId);
  return { ...monitor, allowPrivateTargets } as Monitor;
}

async function captureAlertScreenshot(
  job: NotificationJob,
  monitor: Monitor,
  result: CheckResult,
  language: NotificationLanguage
) {
  let skippedReason: string | null = null;
  const screenshot = await buildFailureScreenshotAttachment(monitor, result.checkedAt, (reason) => {
    skippedReason = reason;
  }, {
    checkStatusCode: result.statusCode,
    skipWhenSiteResponds: isFailureDisprovedByWorkingPage(monitor, result),
    language,
  });

  if (skippedReason && await isNotificationJobOwned(job)) {
    await appendMonitorEvent({
      monitorId: monitor.id,
      userId: monitor.userId,
      eventType: "screenshot-skipped",
      status: result.status,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      message: `Failure screenshot skipped: ${skippedReason}`,
    });
  }

  return screenshot ? [screenshot] : undefined;
}

// Failures a later page load can show to have passed. Redirect-limit failures are excluded because the
// browser follows redirects the monitor forbids, so it would report the very page the monitor rejects.
const SCREENSHOT_DISPROVABLE_FAILURES = new Set(["timeout", "http_status", "connection", "network"]);

// Only a plain HTTP failure is disproved by a working page. Keyword and JSON failures happen on pages
// that load fine, status-code-change alerts are sent while the site is up, and the browser's GET says
// nothing about a POST, PUT, or other request the monitor sends.
export function isFailureDisprovedByWorkingPage(monitor: Monitor, result: CheckResult) {
  return !result.ok
    && monitor.monitorType === "http"
    && (monitor.method === "GET" || monitor.method === "HEAD")
    && SCREENSHOT_DISPROVABLE_FAILURES.has(result.failureReason ?? "")
    // With custom expected codes a refused redirect is reported as an HTTP status failure; the
    // browser would follow it to a working page all the same.
    && !isRedirectStatusCode(result.statusCode);
}

function isRedirectStatusCode(statusCode: number | null) {
  return statusCode !== null && statusCode >= 300 && statusCode < 400;
}

// The payload holds the monitor's recipients and bot tokens, so it is stored encrypted. Dates are
// tagged so they come back as Date objects.
export function encodeNotificationJobPayload(payload: NotificationJobPayload) {
  return encryptValue(JSON.stringify(payload, function replacer(this: Record<string, unknown>, key, value) {
    const raw = this[key];
    if (raw instanceof Date) {
      return Number.isNaN(raw.getTime()) ? null : { $date: raw.toISOString() };
    }
    return value;
  }));
}

export function decodeNotificationJobPayload(encoded: string): NotificationJobPayload | null {
  const json = decryptValue(encoded);
  if (!json) return null;

  try {
    const payload = JSON.parse(json, (_key, value) => {
      if (value && typeof value === "object" && !Array.isArray(value)
        && Object.keys(value).length === 1 && typeof value.$date === "string") {
        return new Date(value.$date);
      }
      return value;
    }) as NotificationJobPayload;
    if (payload?.version !== 1 || !payload.monitor || !payload.result || !(payload.result.checkedAt instanceof Date)) {
      return null;
    }
    return { ...payload, markers: Array.isArray(payload.markers) ? payload.markers : [] };
  } catch {
    return null;
  }
}

type NotificationDispatcherOptions = {
  concurrency: number;
  claimJobs?: (limit: number) => Promise<NotificationJob[]>;
  processJob?: (job: NotificationJob) => Promise<void>;
  wakeDelayMs?: number;
  watchdogMs?: number;
};

// Sends queued alerts in independent slots, like monitor checks. A finished job or a newly queued alert
// wakes it, so alerts go out right away instead of on the next worker tick.
export function createNotificationDispatcher({
  concurrency,
  claimJobs = claimNotificationJobs,
  processJob = processNotificationJob,
  wakeDelayMs = NOTIFICATION_WAKE_DELAY_MS,
  watchdogMs = NOTIFICATION_JOB_WATCHDOG_MS,
}: NotificationDispatcherOptions) {
  const slotCount = Math.max(1, concurrency);
  const running = new Set<Promise<void>>();
  let activeJobs = 0;
  let claimQueue: Promise<unknown> = Promise.resolve();
  let wakeTimer: ReturnType<typeof setTimeout> | null = null;
  let wakePending = false;
  let stopped = false;
  let online = true;
  let canDispatch: () => Promise<boolean> = async () => true;

  function dispatch(): Promise<number> {
    // Claims run one at a time so two dispatches never count the same free slot.
    const next = claimQueue.then(claimAndStart);
    claimQueue = next.catch(() => undefined);
    return next;
  }

  async function claimAndStart() {
    if (stopped || !online || !(await canDispatch())) return 0;

    const freeSlots = slotCount - activeJobs;
    // With every slot busy, the next finishing job wakes the dispatcher again.
    if (freeSlots <= 0) return 0;

    const jobs = await claimJobs(freeSlots);
    for (const job of jobs) {
      startJob(job);
    }
    return jobs.length;
  }

  function startJob(job: NotificationJob) {
    activeJobs += 1;
    const run = runJobWithWatchdog(job)
      .catch((error) => {
        console.error(`[sentrovia] Notification job ${job.id} stopped unexpectedly.`, error);
      })
      .finally(() => {
        activeJobs -= 1;
        running.delete(run);
        // The monitor's next alert may be waiting for this one, and a slot is free now.
        wake();
      });
    running.add(run);
  }

  async function runJobWithWatchdog(job: NotificationJob) {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const task = processJob(job);
    try {
      await Promise.race([
        task,
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            void task.catch(() => undefined);
            console.error(
              `[sentrovia] Notification job ${job.id} for monitor ${job.monitorId} did not finish within ${Math.round(watchdogMs / 1000)} s; it is retried once its claim expires.`
            );
            resolve();
          }, watchdogMs);
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function wake() {
    if (stopped) return;
    if (wakeTimer) {
      wakePending = true;
      return;
    }
    wakePending = false;
    // A short delay lets several finishing jobs and new alerts share one claim query.
    wakeTimer = setTimeout(() => {
      wakeTimer = null;
      void dispatch()
        .catch((error) => {
          console.error("[sentrovia] Unable to start queued notifications.", error);
        })
        .finally(() => {
          if (wakePending) wake();
        });
    }, wakeDelayMs);
    wakeTimer.unref?.();
  }

  return {
    dispatch,
    wake,
    setDispatchGuard(guard: () => Promise<boolean>) {
      canDispatch = guard;
    },
    // Deliveries fail while the worker has no internet access; queued alerts wait for it to return.
    setOnline(value: boolean) {
      online = value;
    },
    stop() {
      stopped = true;
      wakePending = false;
      if (wakeTimer) {
        clearTimeout(wakeTimer);
        wakeTimer = null;
      }
    },
    resume() {
      stopped = false;
    },
    // Resolves once every started job has finished.
    async drain() {
      await claimQueue;
      while (running.size > 0) {
        await Promise.all([...running]);
      }
    },
    getActiveJobCount() {
      return activeJobs;
    },
  };
}

const notificationDispatcher = createNotificationDispatcher({ concurrency: env.notificationConcurrency });

export function dispatchQueuedNotifications(online: boolean) {
  notificationDispatcher.setOnline(online);
  return notificationDispatcher.dispatch();
}

export function wakeNotificationDispatch() {
  notificationDispatcher.wake();
}

export function setNotificationDispatchGuard(guard: () => Promise<boolean>) {
  notificationDispatcher.setDispatchGuard(guard);
}

export function resumeNotificationDispatch() {
  notificationDispatcher.resume();
}

// Stops starting queued alerts and waits for the ones being sent; the rest stay queued.
export async function stopNotificationDispatch() {
  notificationDispatcher.stop();
  await notificationDispatcher.drain();
}

export function getActiveNotificationJobCount() {
  return notificationDispatcher.getActiveJobCount();
}
