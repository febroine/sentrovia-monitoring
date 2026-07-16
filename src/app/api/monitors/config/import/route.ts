import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { toAuthError } from "@/lib/auth/errors";
import { parseMonitorConfigBundle, previewMonitorConfigImport } from "@/lib/monitors/config-service";
import { createManyMonitors } from "@/lib/monitors/service";
import { monitorInputSchema } from "@/lib/monitors/schemas";
import { assertRestorablePostgresMonitorPasswords } from "@/lib/monitors/secret-validation";
import { getSettings } from "@/lib/settings/service";
import { applyMonitorDefaults } from "@/lib/monitors/defaults";
import { serializeMonitorRecord } from "@/lib/monitors/utils";
import { MONITOR_CONFIG_IMPORT_LIMITS } from "@/lib/import-limits";
import { readJsonBody } from "@/lib/http/json-body";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = (await readJsonBody(request, MONITOR_CONFIG_IMPORT_LIMITS.maxRequestBytes)) as {
      format?: string;
      content?: string;
      mode?: string;
    };
    const format = body.format === "yaml" ? "yaml" : "json";
    const mode = body.mode ?? "apply";
    if (mode !== "preview" && mode !== "apply") {
      return NextResponse.json({ message: "Invalid monitor import mode." }, { status: 400 });
    }
    const content = body.content?.trim();

    if (!content) {
      return NextResponse.json({ message: "Paste a JSON or YAML monitor bundle first." }, { status: 400 });
    }

    const bundle = parseMonitorConfigBundle(content, format);
    const settings = await getSettings(session.id);
    const validatedEntries = bundle.monitors.map((monitor, index) => {
      const parsed = monitorInputSchema.safeParse(applyMonitorDefaults(monitor, settings));
      if (!parsed.success) {
        return {
          index: index + 1,
          input: null,
          name: typeof monitor.name === "string" ? monitor.name : `Monitor ${index + 1}`,
          target: typeof monitor.url === "string" ? monitor.url : "Invalid target",
          reason: parsed.error.issues[0]?.message ?? "Invalid monitor payload.",
        };
      }
      try {
        assertRestorablePostgresMonitorPasswords([parsed.data]);
        return { index: index + 1, input: parsed.data, name: parsed.data.name, target: parsed.data.url, reason: null };
      } catch (error) {
        return {
          index: index + 1,
          input: null,
          name: parsed.data.name,
          target: parsed.data.url,
          reason: error instanceof Error ? error.message : "Monitor secrets are not restorable.",
        };
      }
    });
    const validEntries = validatedEntries.filter(
      (entry): entry is typeof entry & { input: NonNullable<typeof entry.input> } => entry.input !== null
    );

    const validPreview = await previewMonitorConfigImport(
      session.id,
      validEntries.map((entry) => entry.input)
    );
    const invalidItems = validatedEntries
      .filter((entry) => entry.input === null)
      .map((entry) => ({
        index: entry.index,
        name: entry.name,
        target: entry.target,
        status: "invalid" as const,
        reason: entry.reason,
      }));
    const preview = {
      items: [
        ...validPreview.items.map((item, index) => ({ ...item, index: validEntries[index].index })),
        ...invalidItems,
      ].sort((left, right) => left.index - right.index),
      summary: {
        ...validPreview.summary,
        invalid: validPreview.summary.invalid + invalidItems.length,
      },
    };
    if (mode === "preview") {
      return NextResponse.json({ preview });
    }

    if (body.mode === undefined && invalidItems.length > 0) {
      return NextResponse.json({
        message: "The monitor bundle contains invalid records. Preview and correct it before importing.",
        preview,
      }, { status: 400 });
    }

    const importableMonitors = validEntries
      .filter((_, index) => validPreview.items[index]?.status === "added")
      .map((entry) => entry.input);
    const created = importableMonitors.length > 0
      ? await createManyMonitors(session.id, importableMonitors)
      : [];
    return NextResponse.json({
      monitors: created.map((monitor) => serializeMonitorRecord(monitor)),
      preview,
    });
  } catch (error) {
    if (
      error instanceof Error
      && (
        error.message.startsWith("Monitor ")
        || error.message.includes("monitor config bundle")
        || error.message.startsWith("Import at most ")
        || error.message.includes("PostgreSQL monitor passwords are not included")
      )
    ) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    const authError = toAuthError(error, "Unable to import monitor configuration right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
