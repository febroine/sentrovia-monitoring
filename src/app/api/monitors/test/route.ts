import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { readJsonBody, STANDARD_JSON_BODY_LIMIT_BYTES } from "@/lib/http/json-body";
import { analyzeRootCause } from "@/lib/monitoring/rca";
import { applyMonitorDefaults } from "@/lib/monitors/defaults";
import { monitorInputSchema } from "@/lib/monitors/schemas";
import { buildMonitorForTest } from "@/lib/monitors/service";
import { getSettings } from "@/lib/settings/service";
import { checkMonitor } from "@/worker/checker";

export const runtime = "nodejs";

const requestSchema = z.object({
  monitorId: z.string().uuid().nullable().optional(),
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
      return NextResponse.json({ message: "Invalid monitor test payload." }, { status: 400 });
    }

    const settings = await getSettings(session.id);
    const defaultsApplied = applyMonitorDefaults(requestData.data.payload, settings);
    const parsed = monitorInputSchema.safeParse({
      ...defaultsApplied,
      name: typeof defaultsApplied.name === "string" && defaultsApplied.name.trim().length >= 2
        ? defaultsApplied.name
        : "Connection test",
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
    const result = await checkMonitor(monitor);
    const rca = analyzeRootCause(result);

    return NextResponse.json({
      result: {
        ok: result.ok,
        status: result.status,
        statusCode: result.statusCode,
        latencyMs: result.latencyMs,
        errorMessage: result.errorMessage,
        failureReason: result.failureReason ?? null,
        checkedAt: result.checkedAt.toISOString(),
        sslExpiresAt: result.sslExpiresAt?.toISOString() ?? null,
      },
      rca,
    });
  } catch (error) {
    const authError = toAuthError(error, "Unable to test this monitor right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
