import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { env } from "@/lib/env";
import { getWebhookEndpoint } from "@/lib/delivery/service";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import { analyzeRootCause } from "@/lib/monitoring/rca";
import { applyMonitorDefaults } from "@/lib/monitors/defaults";
import { monitorInputSchema } from "@/lib/monitors/schemas";
import { isExpectedHttpStatusCode } from "@/lib/monitors/status-codes";
import { buildMonitorForTest } from "@/lib/monitors/service";
import { getSettings } from "@/lib/settings/service";
import { renderNotificationTemplates } from "@/worker/templates";
import { evaluateNotificationDecision } from "@/worker/notifier";
import type { CheckResult, NotificationContext } from "@/worker/types";

export const runtime = "nodejs";

const eventKindSchema = z.enum(["failure", "recovery", "latency", "ssl-expiry"]);
const scenarioSchema = z.enum(["timeout", "http-500", "slow-response", "recovery", "ssl-expiry"]);
const notificationPrefSchema = z.enum(["email", "telegram", "both", "none"]);

const requestSchema = z.object({
  monitorId: z.string().uuid().nullable().optional(),
  kind: eventKindSchema.optional(),
  scenario: scenarioSchema.optional(),
  payload: z.unknown(),
}).refine((value) => value.kind || value.scenario, { message: "Select a notification scenario." });

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const requestData = requestSchema.safeParse(
      await readJsonBody(request, STANDARD_JSON_BODY_LIMIT_BYTES)
    );
    if (!requestData.success) {
      return NextResponse.json({ message: "Invalid notification preview payload." }, { status: 400 });
    }

    const settings = await getSettings(session.id);
    if (!settings) {
      return NextResponse.json(
        { message: "Complete workspace setup before previewing notification templates." },
        { status: 409 }
      );
    }
    const defaultsApplied = applyMonitorDefaults(requestData.data.payload, settings);
    const requestedNotificationPref = notificationPrefSchema.catch("none").parse(defaultsApplied.notificationPref);
    const parsed = monitorInputSchema.safeParse({
      ...defaultsApplied,
      name: typeof defaultsApplied.name === "string" && defaultsApplied.name.trim().length >= 2
        ? defaultsApplied.name
        : "Preview monitor",
      notificationPref: "none",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { message: parsed.error.issues[0]?.message ?? "Invalid monitor payload." },
        { status: 400 }
      );
    }

    const builtMonitor = await buildMonitorForTest(
      session.id,
      parsed.data,
      requestData.data.monitorId
    );
    const monitor = { ...builtMonitor, notificationPref: requestedNotificationPref };
    const scenario = requestData.data.scenario ?? kindToScenario(requestData.data.kind ?? "failure");
    const kind = scenarioToKind(scenario);
    const result = buildSampleResult(
      scenario,
      monitor.slowResponseThresholdMs,
      monitor.timeout
    );
    const rca = analyzeRootCause(result);
    const context: NotificationContext = {
      kind,
      message: buildSampleMessage(kind, result),
      monitor: buildScenarioMonitor(monitor, kind, result.checkedAt),
      result,
      rca,
    };

    const simulationSuppression = getSimulationSuppression(scenario, monitor);
    const [decision, webhook] = await Promise.all([
      simulationSuppression
        ? Promise.resolve({ wouldNotify: false, reason: simulationSuppression })
        : evaluateNotificationDecision(context),
      getWebhookEndpoint(session.id),
    ]);
    return NextResponse.json({
      preview: renderNotificationTemplates(context, settings, env.appUrl),
      decision: {
        ...decision,
        channels: resolveNotificationChannels(monitor.notificationPref, settings, Boolean(webhook?.isActive)),
      },
    });
  } catch (error) {
    const authError = toAuthError(error, "Unable to render the notification preview right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

function getSimulationSuppression(
  scenario: z.infer<typeof scenarioSchema>,
  monitor: Awaited<ReturnType<typeof buildMonitorForTest>>
) {
  if (scenario === "http-500" && isExpectedHttpStatusCode(monitor.expectedStatusCodes, 500)) {
    return "HTTP 500 is configured as an expected response, so the worker would keep this monitor up.";
  }

  if (scenario === "slow-response") {
    if (!supportsResponseTiming(monitor.monitorType)) {
      return "This monitor type does not generate slow-response notifications.";
    }
    if (monitor.slowResponseThresholdMs === null) {
      return "No slow-response threshold is configured for this monitor.";
    }
  }

  return null;
}

function supportsResponseTiming(monitorType: string) {
  return monitorType === "http" || monitorType === "keyword" || monitorType === "json";
}

function buildScenarioMonitor(
  monitor: Awaited<ReturnType<typeof buildMonitorForTest>>,
  kind: z.infer<typeof eventKindSchema>,
  checkedAt: Date
) {
  if (kind === "recovery") {
    return { ...monitor, lastFailureAt: new Date(checkedAt.getTime() - 12 * 60_000) };
  }

  if (kind === "failure" && monitor.status !== "down") {
    return { ...monitor, lastFailureAt: checkedAt };
  }

  return monitor;
}

function buildSampleResult(
  scenario: z.infer<typeof scenarioSchema>,
  slowThresholdMs: number | null,
  timeoutMs: number
): CheckResult {
  const checkedAt = new Date();

  if (scenario === "timeout") {
    return {
      ok: false,
      status: "down",
      statusCode: null,
      latencyMs: timeoutMs,
      errorMessage: `Service did not respond within the configured ${formatTimeout(timeoutMs)} timeout.`,
      failureReason: "timeout",
      checkedAt,
      sslExpiresAt: null,
    };
  }

  if (scenario === "http-500") {
    return {
      ok: false,
      status: "down",
      statusCode: 500,
      latencyMs: 680,
      errorMessage: "Service returned HTTP 500 Internal Server Error.",
      failureReason: "http_status",
      checkedAt,
      sslExpiresAt: null,
    };
  }

  return {
    ok: true,
    status: "up",
    statusCode: 200,
    latencyMs: scenario === "slow-response" ? Math.max((slowThresholdMs ?? 10_000) + 2_500, 12_500) : 420,
    errorMessage: null,
    failureReason: null,
    checkedAt,
    sslExpiresAt: scenario === "ssl-expiry" ? new Date(checkedAt.getTime() + 12 * 24 * 60 * 60_000) : null,
  };
}

function scenarioToKind(scenario: z.infer<typeof scenarioSchema>): z.infer<typeof eventKindSchema> {
  if (scenario === "timeout" || scenario === "http-500") return "failure";
  if (scenario === "slow-response") return "latency";
  return scenario;
}

function kindToScenario(kind: z.infer<typeof eventKindSchema>): z.infer<typeof scenarioSchema> {
  if (kind === "failure") return "timeout";
  if (kind === "latency") return "slow-response";
  return kind;
}

function resolveNotificationChannels(
  preference: "email" | "telegram" | "both" | "none",
  settings: Awaited<ReturnType<typeof getSettings>>,
  webhookActive: boolean
) {
  if (preference === "none") {
    return [];
  }

  const channels: string[] = [];
  if (preference === "email" || preference === "both") channels.push("Email");
  if (preference === "telegram" || preference === "both") channels.push("Telegram");
  if (settings?.notifications.discordEnabled && settings.notifications.discordWebhookUrl) channels.push("Discord");
  if (webhookActive) channels.push("Webhook");
  return channels;
}

function formatTimeout(timeoutMs: number) {
  if (timeoutMs % 1_000 === 0) {
    const seconds = timeoutMs / 1_000;
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }

  return `${timeoutMs} millisecond${timeoutMs === 1 ? "" : "s"}`;
}

function buildSampleMessage(kind: NotificationContext["kind"], result: CheckResult) {
  if (kind === "failure") {
    return result.errorMessage ?? "The monitor failed its availability check.";
  }
  if (kind === "recovery") {
    return "The service is responding normally again.";
  }
  if (kind === "latency") {
    return "The service is online but responding more slowly than the configured threshold.";
  }
  return "The TLS certificate is approaching its expiration date.";
}
