import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { monitorInputSchema } from "@/lib/monitors/schemas";
import { assertRestorablePostgresMonitorPasswords } from "@/lib/monitors/secret-validation";
import { createManyMonitors } from "@/lib/monitors/service";
import { applyMonitorDefaults } from "@/lib/monitors/defaults";
import { getSettings } from "@/lib/settings/service";
import { parseIntervalSetting, serializeMonitorRecord } from "@/lib/monitors/utils";

export const runtime = "nodejs";

function serializeMonitor(monitor: Awaited<ReturnType<typeof createManyMonitors>>[number]) {
  return serializeMonitorRecord(monitor);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { monitors?: unknown };
    const items: unknown[] = Array.isArray(body?.monitors) ? body.monitors : [];

    if (items.length === 0) {
      return NextResponse.json({ message: "Upload at least one CSV row." }, { status: 400 });
    }

    const settings = await getSettings(session.id);
    const intervalDefaults = parseIntervalSetting(settings?.monitoring.interval ?? "1m");

    const parsed = items.map((item, index) => {
      const withDefaults = applyImportDefaults(applyMonitorDefaults(item, settings), settings, intervalDefaults);
      const result = monitorInputSchema.safeParse(withDefaults);
      if (!result.success) {
        throw new Error(`Row ${index + 2}: ${result.error.issues[0]?.message ?? "Invalid monitor data."}`);
      }
      return result.data;
    });

    assertRestorablePostgresMonitorPasswords(parsed);
    const created = await createManyMonitors(session.id, parsed);

    return NextResponse.json({
      monitors: created.map(serializeMonitor),
    });
  } catch (error) {
    if (
      error instanceof Error
      && (
        error.message.startsWith("Row ")
        || error.message.includes("PostgreSQL monitor passwords are not included")
      )
    ) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    const authError = toAuthError(error, "Unable to import monitors right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}

function applyImportDefaults(
  item: unknown,
  settings: Awaited<ReturnType<typeof getSettings>>,
  intervalDefaults: { intervalValue: number; intervalUnit: "sn" | "dk" | "sa" }
) {
  const record = item && typeof item === "object" ? ({ ...item } as Record<string, unknown>) : {};

  if (!record.intervalValue) {
    record.intervalValue = intervalDefaults.intervalValue;
  }

  if (!record.intervalUnit) {
    record.intervalUnit = intervalDefaults.intervalUnit;
  }

  if (!record.timeout) {
    record.timeout = settings?.monitoring.timeout ?? 5000;
  }

  if (!record.monitorType) {
    record.monitorType = "http";
  }

  if (!record.retries && record.retries !== 0) {
    record.retries = settings?.monitoring.retries ?? 3;
  }

  if (!record.method) {
    record.method = settings?.monitoring.method ?? "GET";
  }

  if (!record.responseMaxLength) {
    record.responseMaxLength = settings?.monitoring.responseMaxLength ?? 1024;
  }

  if (!record.maxRedirects && record.maxRedirects !== 0) {
    record.maxRedirects = settings?.monitoring.maxRedirects ?? 5;
  }

  return record;
}
