import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { env } from "@/lib/env";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import { analyzeRootCause } from "@/lib/monitoring/rca";
import { applyMonitorDefaults } from "@/lib/monitors/defaults";
import { monitorInputSchema } from "@/lib/monitors/schemas";
import { buildMonitorForTest } from "@/lib/monitors/service";
import { getSettings } from "@/lib/settings/service";
import { renderNotificationTemplates } from "@/worker/templates";
import type { CheckResult, NotificationContext } from "@/worker/types";

export const runtime = "nodejs";

const requestSchema = z.object({
  monitorId: z.string().uuid().nullable().optional(),
  kind: z.enum(["failure", "recovery", "latency", "ssl-expiry"]),
  payload: z.unknown(),
});

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

    const monitor = await buildMonitorForTest(
      session.id,
      parsed.data,
      requestData.data.monitorId
    );
    const result = buildSampleResult(
      requestData.data.kind,
      monitor.slowResponseThresholdMs,
      monitor.timeout
    );
    const rca = analyzeRootCause(result);
    const context: NotificationContext = {
      kind: requestData.data.kind,
      message: buildSampleMessage(requestData.data.kind, result),
      monitor: requestData.data.kind === "recovery"
        ? { ...monitor, lastFailureAt: new Date(result.checkedAt.getTime() - 12 * 60_000) }
        : monitor,
      result,
      rca,
    };

    return NextResponse.json({
      preview: renderNotificationTemplates(context, settings, env.appUrl),
    });
  } catch (error) {
    const authError = toAuthError(error, "Unable to render the notification preview right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

function buildSampleResult(
  kind: "failure" | "recovery" | "latency" | "ssl-expiry",
  slowThresholdMs: number | null,
  timeoutMs: number
): CheckResult {
  const checkedAt = new Date();

  if (kind === "failure") {
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

  return {
    ok: true,
    status: "up",
    statusCode: 200,
    latencyMs: kind === "latency" ? Math.max((slowThresholdMs ?? 10_000) + 2_500, 12_500) : 420,
    errorMessage: null,
    failureReason: null,
    checkedAt,
    sslExpiresAt: kind === "ssl-expiry" ? new Date(checkedAt.getTime() + 12 * 24 * 60 * 60_000) : null,
  };
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
