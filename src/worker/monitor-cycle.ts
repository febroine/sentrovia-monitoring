import { hasRecentFailedNotificationDelivery } from "@/lib/delivery/service";
import { runMonitorDiagnostics } from "@/lib/diagnostics/service";
import { openOrUpdateOutage, resolveOutage } from "@/lib/outages/service";
import { analyzeRootCause } from "@/lib/monitoring/rca";
import {
  appendMonitorCheck,
  appendOutageEvent as persistOutageEvent,
  appendMonitorDiagnostic,
  appendMonitorEvent,
  incrementWorkerCheckedCount,
  getRecentMonitorEventMessage,
  isMonitorActive,
  recordMonitorResult,
  refreshMonitorUptime,
  updateWorkerState,
  type ClaimedMonitor,
} from "@/lib/monitors/service";
import { canUserAccessPrivateTargets } from "@/lib/security/network-policy";
import { calculateVerificationTimeout } from "@/lib/monitors/verification";
import type { Monitor } from "@/lib/db/schema";
import {
  calculateNextCheckAt,
  calculateOutageRecheckAt,
  calculateVerificationCheckAt,
  checkMonitor,
} from "@/worker/checker";
import { ensureWorkerConnectivity } from "@/worker/connectivity";
import { sendMonitorNotifications } from "@/worker/notifier";
import { buildFailureScreenshotAttachment } from "@/worker/screenshot";

const SSL_EXPIRY_WARNING_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1_000;

export type MonitorCycleResult = {
  finalStatus: "up" | "down" | "pending";
  latencyMs: number | null;
};

type MonitorResultUpdate = Parameters<typeof recordMonitorResult>[1];
type CheckResult = Awaited<ReturnType<typeof checkMonitor>>;
type RootCause = ReturnType<typeof analyzeRootCause>;

type ProbeSequence = {
  checkCompletedAt: Date;
  diagnosticMonitor: Monitor;
  executedProbeCount: number;
  recoveredDuringFinalConfirmation: boolean;
  result: CheckResult;
  terminalResult?: MonitorCycleResult;
};

type TransitionOutcome = {
  checkStatus: "up" | "down" | "pending";
  failureEventMessage: string | null;
  outageConfirmedThisCycle: boolean;
};

type ProbeState = {
  hadConfirmedOutage: boolean;
  threshold: number;
  verificationAttempt: number;
  wasVerifying: boolean;
};

export async function processClaimedMonitor(monitor: ClaimedMonitor): Promise<MonitorCycleResult | null> {
  const threshold = Math.max(2, monitor.retries);
  const previousStatus = monitor.status;
  const previousStatusCode = monitor.statusCode;
  const hadConfirmedOutage = previousStatus === "down" && !monitor.verificationMode;
  const wasVerifying = monitor.verificationMode;
  const verificationAttempt = wasVerifying ? monitor.verificationFailureCount : 0;
  const probe = await executeProbeSequence(monitor, {
    hadConfirmedOutage,
    threshold,
    verificationAttempt,
    wasVerifying,
  });
  if (!probe || probe.terminalResult) {
    return probe?.terminalResult ?? null;
  }

  const rca = analyzeRootCause(probe.result);
  const diagnosticMonitor = !probe.result.ok && !hadConfirmedOutage && !wasVerifying
    ? withVerificationTimeout(monitor, 1)
    : probe.diagnosticMonitor;
  const transition = await applyMonitorTransition(monitor, probe, rca, {
    hadConfirmedOutage,
    previousStatus,
    threshold,
    wasVerifying,
  });
  if (!transition) {
    return null;
  }

  await recordCycleCheck(monitor, probe, transition.checkStatus);
  await handleSuccessfulCheck(monitor, probe, rca, {
    hadConfirmedOutage,
    verificationAttempt,
    wasVerifying,
  });
  const failureNotificationSent = await handleFailedCheck(
    monitor,
    diagnosticMonitor,
    probe.result,
    rca,
    transition
  );
  await sendDowntimeReminderIfNeeded(monitor, probe.result, rca, transition, failureNotificationSent);
  await handleRecovery(monitor, probe.result, rca, hadConfirmedOutage);
  await handleStatusCodeChange(monitor, probe.result, rca, transition, {
    hadConfirmedOutage,
    previousStatusCode,
  });

  await retryTransitionNotifications(monitor, probe.result, rca);

  return {
    finalStatus: transition.checkStatus,
    latencyMs: probe.result.latencyMs,
  };
}

async function executeProbeSequence(
  monitor: ClaimedMonitor,
  state: ProbeState
): Promise<ProbeSequence | null> {
  let diagnosticMonitor = withVerificationTimeout(monitor, state.verificationAttempt);
  let result = await checkClaimedMonitor(diagnosticMonitor, monitor.allowPrivateTargets);
  let executedProbeCount = 1;
  const firstProbeCompletedAt = new Date();

  if (!result.ok && result.failureReason === "configuration") {
    return terminalProbe(await recordConfigurationFailure(monitor, result, firstProbeCompletedAt), diagnosticMonitor, result);
  }
  if (!result.ok && !(await ensureWorkerConnectivity()).available) {
    return null;
  }

  let recoveredDuringFinalConfirmation = false;
  if (shouldRunFinalConfirmationProbe(result.ok, state.hadConfirmedOutage, state.wasVerifying, state.verificationAttempt, state.threshold)) {
    diagnosticMonitor = withVerificationTimeout(monitor, state.threshold);
    result = await checkClaimedMonitor(diagnosticMonitor, monitor.allowPrivateTargets);
    executedProbeCount += 1;
    recoveredDuringFinalConfirmation = result.ok;
    if (!result.ok && !(await ensureWorkerConnectivity()).available) {
      return null;
    }
  }

  const checkCompletedAt = new Date();
  if (!result.ok && result.failureReason === "configuration") {
    return terminalProbe(await recordConfigurationFailure(monitor, result, checkCompletedAt), diagnosticMonitor, result);
  }

  return { checkCompletedAt, diagnosticMonitor, executedProbeCount, recoveredDuringFinalConfirmation, result };
}

function terminalProbe(
  terminalResult: MonitorCycleResult | null,
  diagnosticMonitor: Monitor,
  result: CheckResult
): ProbeSequence | null {
  return terminalResult
    ? {
        checkCompletedAt: new Date(),
        diagnosticMonitor,
        executedProbeCount: 1,
        recoveredDuringFinalConfirmation: false,
        result,
        terminalResult,
      }
    : null;
}

async function applyMonitorTransition(
  monitor: ClaimedMonitor,
  probe: ProbeSequence,
  rca: RootCause,
  state: { hadConfirmedOutage: boolean; previousStatus: string; threshold: number; wasVerifying: boolean }
): Promise<TransitionOutcome | null> {
  if (probe.result.ok) {
    return recordUpTransition(monitor, probe);
  }
  if (state.hadConfirmedOutage) {
    return recordExistingOutageTransition(monitor, probe);
  }
  if (state.wasVerifying) {
    return recordVerificationTransition(monitor, probe, rca, state.previousStatus, state.threshold);
  }
  return recordInitialFailureTransition(monitor, probe, rca, state.previousStatus, state.threshold);
}

async function recordUpTransition(monitor: ClaimedMonitor, probe: ProbeSequence) {
  const { result } = probe;
  const recorded = await recordActiveMonitorResult(monitor, {
    status: "up",
    statusCode: result.statusCode,
    lastCheckedAt: result.checkedAt,
    nextCheckAt: calculateNextCheckAt(monitor, result.checkedAt, probe.checkCompletedAt),
    lastSuccessAt: result.checkedAt,
    lastFailureAt: null,
    sslExpiresAt: result.sslExpiresAt,
    lastErrorMessage: null,
    consecutiveFailures: 0,
    verificationMode: false,
    verificationFailureCount: 0,
    latencyMs: result.latencyMs,
  });
  return recorded ? defaultTransition("up") : null;
}

async function recordExistingOutageTransition(monitor: ClaimedMonitor, probe: ProbeSequence) {
  const { result } = probe;
  const recorded = await recordActiveMonitorResult(monitor, {
    status: "down",
    statusCode: result.statusCode,
    lastCheckedAt: result.checkedAt,
    nextCheckAt: calculateOutageRecheckAt(monitor, result.checkedAt, probe.checkCompletedAt),
    lastSuccessAt: monitor.lastSuccessAt,
    lastFailureAt: monitor.lastFailureAt ?? result.checkedAt,
    sslExpiresAt: result.sslExpiresAt,
    lastErrorMessage: result.errorMessage,
    consecutiveFailures: monitor.consecutiveFailures + 1,
    verificationMode: false,
    verificationFailureCount: 0,
    latencyMs: result.latencyMs,
  });
  return recorded
    ? { ...defaultTransition("down"), failureEventMessage: buildFailureEventMessage(result) }
    : null;
}

async function recordVerificationTransition(
  monitor: ClaimedMonitor,
  probe: ProbeSequence,
  rca: RootCause,
  previousStatus: string,
  threshold: number
): Promise<TransitionOutcome | null> {
  const { result } = probe;
  const verificationCount = monitor.verificationFailureCount + 1;
  const confirmedOutage = verificationCount >= threshold;
  const checkStatus = confirmedOutage ? "down" : "pending";
  const recorded = await recordActiveMonitorResult(monitor, {
    status: checkStatus,
    statusCode: result.statusCode,
    lastCheckedAt: result.checkedAt,
    nextCheckAt: confirmedOutage
      ? calculateOutageRecheckAt(monitor, result.checkedAt, probe.checkCompletedAt)
      : calculateVerificationCheckAt(result.checkedAt, probe.checkCompletedAt),
    lastSuccessAt: monitor.lastSuccessAt,
    lastFailureAt: previousStatus === "up" ? result.checkedAt : monitor.lastFailureAt ?? result.checkedAt,
    sslExpiresAt: result.sslExpiresAt,
    lastErrorMessage: result.errorMessage,
    consecutiveFailures: verificationCount,
    verificationMode: !confirmedOutage,
    verificationFailureCount: confirmedOutage ? 0 : verificationCount,
    latencyMs: result.latencyMs,
  });
  if (!recorded) return null;
  if (!confirmedOutage) await recordPendingVerification(monitor, probe.diagnosticMonitor, result, rca, verificationCount, threshold);
  return {
    checkStatus,
    failureEventMessage: confirmedOutage ? buildFailureEventMessage(result) : null,
    outageConfirmedThisCycle: confirmedOutage,
  };
}

async function recordInitialFailureTransition(
  monitor: ClaimedMonitor,
  probe: ProbeSequence,
  rca: RootCause,
  previousStatus: string,
  threshold: number
): Promise<TransitionOutcome | null> {
  const { result } = probe;
  const diagnosticMonitor = withVerificationTimeout(monitor, 1);
  const recorded = await recordActiveMonitorResult(monitor, {
    status: "pending",
    statusCode: result.statusCode,
    lastCheckedAt: result.checkedAt,
    nextCheckAt: calculateVerificationCheckAt(result.checkedAt, probe.checkCompletedAt),
    lastSuccessAt: monitor.lastSuccessAt,
    lastFailureAt: previousStatus === "up" ? result.checkedAt : monitor.lastFailureAt ?? result.checkedAt,
    sslExpiresAt: result.sslExpiresAt,
    lastErrorMessage: result.errorMessage,
    consecutiveFailures: 1,
    verificationMode: true,
    verificationFailureCount: 1,
    latencyMs: result.latencyMs,
  });
  if (!recorded) return null;
  await appendDetailedEvent(monitor, result, "verification", `Verification mode started. Attempt 1 of ${threshold} failed.`, rca, "pending");
  await appendTimelineEvent({
    monitorId: monitor.id,
    userId: monitor.userId,
    eventType: "verification_started",
    title: `Verification started (1/${threshold})`,
    detail: result.errorMessage ?? "The first failure is pending confirmation.",
    metadata: buildAttemptMetadata(result, 1, threshold),
    createdAt: result.checkedAt,
  });
  await recordFailureDiagnostics(diagnosticMonitor);
  return defaultTransition("pending");
}

async function recordPendingVerification(
  monitor: ClaimedMonitor,
  diagnosticMonitor: Monitor,
  result: CheckResult,
  rca: RootCause,
  verificationCount: number,
  threshold: number
) {
  const message = `Verification attempt ${verificationCount} of ${threshold} failed. Outage is pending confirmation.`;
  await appendDetailedEvent(monitor, result, "verification", message, rca, "pending");
  await appendTimelineEvent({
    monitorId: monitor.id,
    userId: monitor.userId,
    eventType: "verification_attempt_failed",
    title: `Verification attempt ${verificationCount}/${threshold} failed`,
    detail: result.errorMessage ?? "The worker is still confirming the outage.",
    metadata: buildAttemptMetadata(result, verificationCount, threshold),
    createdAt: result.checkedAt,
  });
  await recordFailureDiagnostics(diagnosticMonitor);
}

function defaultTransition(checkStatus: TransitionOutcome["checkStatus"]): TransitionOutcome {
  return { checkStatus, failureEventMessage: null, outageConfirmedThisCycle: false };
}

async function recordCycleCheck(monitor: ClaimedMonitor, probe: ProbeSequence, checkStatus: TransitionOutcome["checkStatus"]) {
  await updateWorkerState({ heartbeatAt: new Date() });
  await incrementWorkerCheckedCount(probe.executedProbeCount);
  await appendMonitorCheck({
    monitorId: monitor.id,
    userId: monitor.userId,
    status: checkStatus,
    statusCode: probe.result.statusCode,
    latencyMs: probe.result.latencyMs,
    createdAt: probe.result.checkedAt,
  });
  if (checkStatus !== "pending") {
    await refreshMonitorUptimeSafely(monitor, probe.result.checkedAt);
  }
}

async function handleSuccessfulCheck(
  monitor: ClaimedMonitor,
  probe: ProbeSequence,
  rca: RootCause,
  state: { hadConfirmedOutage: boolean; verificationAttempt: number; wasVerifying: boolean }
) {
  if (!probe.result.ok) return;
  if (state.wasVerifying && !state.hadConfirmedOutage) {
    await recordVerificationRecovery(monitor, probe, rca, state.verificationAttempt);
  }
  await appendCheckEvent(monitor, probe.result, rca);
  await handleSlowResponse(monitor, probe.result, rca);
  await sendSslExpiryWarning(monitor, probe.result, rca);
}

async function recordVerificationRecovery(
  monitor: ClaimedMonitor,
  probe: ProbeSequence,
  rca: RootCause,
  verificationAttempt: number
) {
  const message = probe.recoveredDuringFinalConfirmation
    ? "Final confirmation recovered before outage confirmation."
    : "Verification recovered before outage confirmation.";
  await appendDetailedEvent(monitor, probe.result, "verification", message, rca, "up");
  await appendTimelineEvent({
    monitorId: monitor.id,
    userId: monitor.userId,
    eventType: "verification_recovered",
    title: "Verification recovered",
    detail: message,
    metadata: {
      previousFailureCount: verificationAttempt,
      recoveredDuringFinalConfirmation: probe.recoveredDuringFinalConfirmation,
      statusCode: probe.result.statusCode,
      latencyMs: probe.result.latencyMs,
    },
    createdAt: probe.result.checkedAt,
  });
}

async function handleSlowResponse(monitor: ClaimedMonitor, result: CheckResult, rca: RootCause) {
  const message = buildSlowResponseMessage(monitor, result);
  if (!message) return;
  await appendDetailedEvent(monitor, result, "latency", message, rca, "up");
  if (!monitor.slowResponseAlertsEnabled || !hasEnteredSlowResponseState(monitor, result)) return;
  const notificationSent = await sendMonitorNotifications({ kind: "latency", message, monitor, result, rca });
  if (notificationSent) {
    await appendDetailedEvent(monitor, result, "latency-notification", message, rca, "up");
  }
}

async function handleFailedCheck(
  monitor: ClaimedMonitor,
  diagnosticMonitor: Monitor,
  result: CheckResult,
  rca: RootCause,
  transition: TransitionOutcome
) {
  if (result.ok || !transition.failureEventMessage) return false;
  const message = transition.failureEventMessage;
  await appendDetailedEvent(monitor, result, "failure", message, rca, transition.checkStatus);
  const diagnostic = await recordFailureDiagnostics(diagnosticMonitor);
  const outage = await openOrUpdateOutage({
    monitorId: monitor.id,
    userId: monitor.userId,
    checkedAt: result.checkedAt,
    statusCode: result.statusCode,
    errorMessage: message,
  });
  await recordOutageTimeline(monitor, result, transition, message, diagnostic?.summary, outage?.id);
  if (transition.checkStatus !== "down") return false;
  const sent = await sendMonitorNotifications({
    kind: "failure",
    message,
    monitor,
    result,
    rca,
    buildEmailAttachments: () => buildAlertEmailAttachments(monitor, result),
  });
  if (sent) await appendDetailedEvent(monitor, result, "failure-notification", message, rca, "down");
  return sent;
}

async function recordOutageTimeline(
  monitor: ClaimedMonitor,
  result: CheckResult,
  transition: TransitionOutcome,
  message: string,
  diagnosticSummary: string | null | undefined,
  outageId: string | null | undefined
) {
  await appendTimelineEvent({
    outageId: outageId ?? null,
    monitorId: monitor.id,
    userId: monitor.userId,
    eventType: transition.outageConfirmedThisCycle ? "outage_confirmed" : "outage_still_down",
    title: transition.outageConfirmedThisCycle ? "Outage confirmed" : "Outage still active",
    detail: message,
    metadata: {
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      failureReason: result.failureReason ?? null,
      diagnosticSummary: diagnosticSummary ?? null,
    },
    createdAt: result.checkedAt,
  });
}

async function sendDowntimeReminderIfNeeded(
  monitor: ClaimedMonitor,
  result: CheckResult,
  rca: RootCause,
  transition: TransitionOutcome,
  failureNotificationSent: boolean
) {
  if (result.ok || transition.checkStatus !== "down" || transition.outageConfirmedThisCycle || failureNotificationSent) return;
  const message = buildDowntimeReminderMessage(monitor, result.checkedAt);
  if (!message) return;
  const sent = await sendMonitorNotifications({
    kind: "downtime-reminder",
    message,
    monitor,
    result,
    rca,
    buildEmailAttachments: () => buildAlertEmailAttachments(monitor, result),
  });
  if (sent) await appendDetailedEvent(monitor, result, "downtime-reminder", message, rca, "down");
}

async function handleRecovery(monitor: ClaimedMonitor, result: CheckResult, rca: RootCause, hadConfirmedOutage: boolean) {
  if (!result.ok || !hadConfirmedOutage) return;
  const message = "Service recovered and is responding again.";
  await appendDetailedEvent(monitor, result, "recovery", message, rca, "up");
  const outage = await resolveOutage({
    monitorId: monitor.id,
    userId: monitor.userId,
    checkedAt: result.checkedAt,
    statusCode: result.statusCode,
  });
  await appendTimelineEvent({
    outageId: outage?.id ?? null,
    monitorId: monitor.id,
    userId: monitor.userId,
    eventType: "recovery_detected",
    title: "Recovery detected",
    detail: message,
    metadata: { statusCode: result.statusCode, latencyMs: result.latencyMs },
    createdAt: result.checkedAt,
  });
  const sent = await sendMonitorNotifications({ kind: "recovery", message, monitor, result, rca });
  if (sent) await appendDetailedEvent(monitor, result, "recovery-notification", message, rca, "up");
}

async function handleStatusCodeChange(
  monitor: ClaimedMonitor,
  result: CheckResult,
  rca: RootCause,
  transition: TransitionOutcome,
  state: { hadConfirmedOutage: boolean; previousStatusCode: number | null }
) {
  if (!shouldNotifyStatusCodeChange(monitor, result, transition, state)) return;
  const message = `Status code changed from ${state.previousStatusCode} to ${result.statusCode}.`;
  await appendDetailedEvent(monitor, result, "status-change", message, rca, transition.checkStatus);
  const sent = await sendMonitorNotifications({
    kind: "status-change",
    message,
    monitor,
    result,
    rca,
    buildEmailAttachments: () => buildAlertEmailAttachments(monitor, result),
  });
  if (sent) await appendDetailedEvent(monitor, result, "status-change-notification", message, rca, transition.checkStatus);
}

function shouldNotifyStatusCodeChange(
  monitor: ClaimedMonitor,
  result: CheckResult,
  transition: TransitionOutcome,
  state: { hadConfirmedOutage: boolean; previousStatusCode: number | null }
) {
  return transition.checkStatus !== "pending"
    && !state.hadConfirmedOutage
    && !transition.outageConfirmedThisCycle
    && !monitor.verificationMode
    && state.previousStatusCode !== null
    && result.statusCode !== null
    && state.previousStatusCode !== result.statusCode;
}

async function checkClaimedMonitor(monitor: Monitor, allowPrivateTargets: boolean | undefined) {
  const currentPrivateTargetAccess = allowPrivateTargets === true
    ? await canUserAccessPrivateTargets(monitor.userId, undefined, monitor.workspaceId)
    : false;
  return checkMonitor(monitor, { allowPrivateTargets: currentPrivateTargetAccess });
}

async function recordConfigurationFailure(
  monitor: Monitor,
  result: Awaited<ReturnType<typeof checkMonitor>>,
  completedAt: Date
): Promise<MonitorCycleResult | null> {
  const recorded = await recordActiveMonitorResult(monitor, {
    status: monitor.status === "down" ? "down" : "pending",
    statusCode: monitor.statusCode,
    lastCheckedAt: result.checkedAt,
    nextCheckAt: calculateNextCheckAt(monitor, result.checkedAt, completedAt),
    lastSuccessAt: monitor.lastSuccessAt,
    lastFailureAt: monitor.lastFailureAt,
    sslExpiresAt: monitor.sslExpiresAt,
    lastErrorMessage: result.errorMessage,
    consecutiveFailures: monitor.consecutiveFailures,
    verificationMode: monitor.verificationMode,
    verificationFailureCount: monitor.verificationFailureCount,
    latencyMs: result.latencyMs,
  });
  if (!recorded) {
    return null;
  }

  const rca = analyzeRootCause(result);
  await updateWorkerState({ heartbeatAt: completedAt });
  await incrementWorkerCheckedCount(1);
  await appendMonitorCheck({
    monitorId: monitor.id,
    userId: monitor.userId,
    status: "pending",
    statusCode: null,
    latencyMs: result.latencyMs,
    createdAt: result.checkedAt,
  });
  await appendDetailedEvent(
    monitor,
    result,
    "configuration-error",
    result.errorMessage ?? "Monitor configuration could not be checked.",
    rca,
    "pending"
  );

  return { finalStatus: "pending", latencyMs: result.latencyMs };
}

async function refreshMonitorUptimeSafely(monitor: Monitor, checkedAt: Date) {
  try {
    await refreshMonitorUptime(monitor.userId, monitor.id, monitor.leaseToken, checkedAt);
  } catch (error) {
    console.error(`[sentrovia] Unable to refresh uptime for monitor ${monitor.id}.`, error);
  }
}

async function retryTransitionNotifications(
  monitor: Monitor,
  result: Awaited<ReturnType<typeof checkMonitor>>,
  rca: ReturnType<typeof analyzeRootCause>
) {
  if (!result.ok) {
    return;
  }

  const before = new Date(result.checkedAt.getTime() - 1);
  const since = new Date(before.getTime() - DAY_MS);
  await retryTransitionNotification("recovery", monitor, result, rca, since, before);
  await retryTransitionNotification("status-change", monitor, result, rca, since, before);
}

async function retryTransitionNotification(
  kind: "recovery" | "status-change",
  monitor: Monitor,
  result: Awaited<ReturnType<typeof checkMonitor>>,
  rca: ReturnType<typeof analyzeRootCause>,
  since: Date,
  before: Date
) {
  const transitionMessage = await getRecentMonitorEventMessage({
    monitorId: monitor.id,
    eventType: kind,
    since,
    before,
  });
  if (!transitionMessage) {
    return;
  }

  const notificationRecorded = await getRecentMonitorEventMessage({
    monitorId: monitor.id,
    eventType: `${kind}-notification`,
    since,
    before,
  });
  if (notificationRecorded) {
    return;
  }

  const failedDelivery = await hasRecentFailedNotificationDelivery({
    userId: monitor.userId,
    monitorId: monitor.id,
    kind,
    since,
    before,
  });
  if (!failedDelivery) {
    return;
  }

  const notificationSent = await sendMonitorNotifications({
    kind,
    message: transitionMessage,
    monitor,
    result,
    rca,
    buildEmailAttachments: kind === "status-change"
      ? () => buildAlertEmailAttachments(monitor, result)
      : undefined,
  });
  if (notificationSent) {
    await appendDetailedEvent(
      monitor,
      result,
      `${kind}-notification`,
      transitionMessage,
      rca,
      "up"
    );
  }
}

function shouldRunFinalConfirmationProbe(
  resultOk: boolean,
  hadConfirmedOutage: boolean,
  wasVerifying: boolean,
  verificationAttempt: number,
  threshold: number
) {
  return !resultOk
    && !hadConfirmedOutage
    && wasVerifying
    && verificationAttempt + 1 >= threshold;
}

async function buildAlertEmailAttachments(
  monitor: Monitor,
  result: Awaited<ReturnType<typeof checkMonitor>>
) {
  let skippedReason: string | null = null;
  const screenshot = await buildFailureScreenshotAttachment(monitor, result.checkedAt, (reason) => {
    skippedReason = reason;
  });

  if (skippedReason) {
    await appendMonitorEvent({
      monitorId: monitor.id,
      userId: monitor.userId,
      eventType: "screenshot-skipped",
      status: monitor.status,
      statusCode: monitor.statusCode,
      latencyMs: monitor.latencyMs,
      message: `Failure screenshot skipped: ${skippedReason}`,
    });
  }

  return screenshot ? [screenshot] : undefined;
}

async function recordFailureDiagnostics(monitor: Monitor) {
  try {
    const diagnostic = await runMonitorDiagnostics(monitor);
    await appendMonitorDiagnostic({
      monitorId: monitor.id,
      userId: monitor.userId,
      diagnostic,
    });
    await appendTimelineEvent({
      monitorId: monitor.id,
      userId: monitor.userId,
      eventType: "diagnostic_completed",
      title: "Network diagnostics completed",
      detail: diagnostic.summary,
      metadata: {
        failedPhase: diagnostic.failedPhase,
        failureCategory: diagnostic.failureCategory,
        resolvedIps: diagnostic.resolvedIps,
        timeoutMs: diagnostic.timeoutMs,
      },
      createdAt: diagnostic.createdAt,
    });

    return diagnostic;
  } catch (error) {
    await appendTimelineEvent({
      monitorId: monitor.id,
      userId: monitor.userId,
      eventType: "diagnostic_failed",
      title: "Network diagnostics failed",
      detail: error instanceof Error ? error.message : "Diagnostics failed unexpectedly.",
    });
    return null;
  }
}

type OutageTimelineInput = Parameters<typeof persistOutageEvent>[0];

async function appendTimelineEvent(input: OutageTimelineInput) {
  try {
    await persistOutageEvent(input);
  } catch (error) {
    await appendMonitorEvent({
      monitorId: input.monitorId,
      userId: input.userId,
      eventType: "timeline-write-failed",
      status: null,
      message: error instanceof Error ? error.message : "Outage timeline event could not be stored.",
    });
  }
}

function buildAttemptMetadata(result: Awaited<ReturnType<typeof checkMonitor>>, attempt: number, threshold: number) {
  return {
    attempt,
    threshold,
    statusCode: result.statusCode,
    latencyMs: result.latencyMs,
    failureReason: result.failureReason ?? null,
    errorMessage: result.errorMessage,
  };
}

async function recordActiveMonitorResult(monitor: Monitor, update: MonitorResultUpdate) {
  const recorded = await recordMonitorResult(monitor.id, update, monitor.leaseToken);
  if (!recorded) {
    return false;
  }

  return isMonitorActive(monitor.id);
}

function withVerificationTimeout(monitor: Monitor, verificationAttempt: number) {
  const timeout = calculateVerificationTimeout(monitor.timeout, verificationAttempt);

  if (timeout === monitor.timeout) {
    return monitor;
  }

  return {
    ...monitor,
    timeout,
  };
}

function buildDowntimeReminderMessage(monitor: Monitor, checkedAt: Date) {
  if (!monitor.lastFailureAt) {
    return null;
  }

  const downtimeStartedAt = new Date(monitor.lastFailureAt);
  if (Number.isNaN(downtimeStartedAt.getTime())) {
    return null;
  }

  const durationMinutes = Math.max(0, Math.floor((checkedAt.getTime() - downtimeStartedAt.getTime()) / 60_000));
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;

  if (hours > 0) {
    return `Service has been down for ${hours}h ${minutes}m.`;
  }

  return `Service has been down for ${durationMinutes}m.`;
}

function buildSlowResponseMessage(monitor: Monitor, result: Awaited<ReturnType<typeof checkMonitor>>) {
  if (!supportsSlowResponseThreshold(monitor) || typeof result.latencyMs !== "number") {
    return null;
  }

  const thresholdMs = monitor.slowResponseThresholdMs;
  if (thresholdMs === null || result.latencyMs <= thresholdMs) {
    return null;
  }

  return `Service is online but slow: ${result.latencyMs}ms exceeded the ${thresholdMs}ms threshold.`;
}

function hasEnteredSlowResponseState(monitor: Monitor, result: Awaited<ReturnType<typeof checkMonitor>>) {
  if (
    !supportsSlowResponseThreshold(monitor)
    || typeof result.latencyMs !== "number"
  ) {
    return false;
  }

  const thresholdMs = monitor.slowResponseThresholdMs;
  if (typeof thresholdMs !== "number" || result.latencyMs <= thresholdMs) {
    return false;
  }

  const wasAlreadySlow = monitor.status === "up"
    && !monitor.verificationMode
    && typeof monitor.latencyMs === "number"
    && monitor.latencyMs > thresholdMs;

  return !wasAlreadySlow;
}

function supportsSlowResponseThreshold(monitor: Monitor) {
  return monitor.monitorType === "http" || monitor.monitorType === "keyword" || monitor.monitorType === "json";
}

async function sendSslExpiryWarning(
  monitor: Monitor,
  result: Awaited<ReturnType<typeof checkMonitor>>,
  rca: ReturnType<typeof analyzeRootCause>
) {
  const message = buildSslExpiryMessage(monitor, result);
  if (!message) {
    return;
  }

  const notificationSent = await sendMonitorNotifications({
    kind: "ssl-expiry",
    message,
    monitor,
    result,
    rca,
  });

  if (notificationSent) {
    await appendDetailedEvent(monitor, result, "ssl-expiry", message, rca, "up");
    await appendDetailedEvent(monitor, result, "ssl-expiry-notification", message, rca, "up");
  }
}

function buildSslExpiryMessage(monitor: Monitor, result: Awaited<ReturnType<typeof checkMonitor>>) {
  if (!monitor.checkSslExpiry || !result.sslExpiresAt) {
    return null;
  }

  const remainingMs = result.sslExpiresAt.getTime() - result.checkedAt.getTime();
  if (remainingMs > SSL_EXPIRY_WARNING_DAYS * DAY_MS) {
    return null;
  }

  const expiryDate = result.sslExpiresAt.toISOString().slice(0, 10);
  if (remainingMs <= 0) {
    return `TLS certificate expired on ${expiryDate}.`;
  }

  const remainingDays = Math.max(1, Math.ceil(remainingMs / DAY_MS));
  return `TLS certificate expires in ${remainingDays} day${remainingDays === 1 ? "" : "s"} on ${expiryDate}.`;
}

function buildFailureEventMessage(result: Awaited<ReturnType<typeof checkMonitor>>) {
  if (result.failureReason === "timeout") {
    return result.errorMessage ?? "Timeout confirmed: service did not respond within the configured timeout.";
  }

  if (result.failureReason === "http_status" && result.statusCode !== null) {
    return `Service returned HTTP ${result.statusCode}.`;
  }

  if (result.failureReason === "dns") {
    return result.errorMessage ?? "DNS resolution failed for the monitored target.";
  }

  if (result.failureReason === "tls") {
    return result.errorMessage ?? "TLS or certificate validation failed for the monitored target.";
  }

  if (result.failureReason === "connection") {
    return result.errorMessage ?? "Connection failed before the service returned a response.";
  }

  if (result.failureReason === "assertion") {
    return result.errorMessage ?? "Response assertion failed.";
  }

  return result.errorMessage ?? "Health check failed.";
}

async function appendCheckEvent(
  monitor: Monitor,
  result: Awaited<ReturnType<typeof checkMonitor>>,
  rca: ReturnType<typeof analyzeRootCause>
) {
  const message = `Check completed successfully in ${result.latencyMs ?? "n/a"}ms.`;
  await appendMonitorEvent({
    monitorId: monitor.id,
    userId: monitor.userId,
    eventType: "check",
    status: result.status,
    statusCode: result.statusCode,
    latencyMs: result.latencyMs,
    message,
    rcaType: rca.type,
    rcaTitle: rca.title,
    rcaSummary: rca.summary,
  });
}

async function appendDetailedEvent(
  monitor: Monitor,
  result: Awaited<ReturnType<typeof checkMonitor>>,
  eventType: string,
  message: string,
  rca: ReturnType<typeof analyzeRootCause>,
  status: "up" | "down" | "pending"
) {
  await appendMonitorEvent({
    monitorId: monitor.id,
    userId: monitor.userId,
    eventType,
    status,
    statusCode: result.statusCode,
    latencyMs: result.latencyMs,
    message,
    rcaType: rca.type,
    rcaTitle: rca.title,
    rcaSummary: rca.summary,
  });
}
