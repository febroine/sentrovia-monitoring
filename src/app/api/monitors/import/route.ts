import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { AuthError, toAuthError } from "@/lib/auth/errors";
import { assertPermission } from "@/lib/auth/permissions";
import { monitorInputSchema } from "@/lib/monitors/schemas";
import { assertRestorablePostgresMonitorPasswords } from "@/lib/monitors/secret-validation";
import { assertMonitorNetworkTargetAllowed, createManyMonitors, getMonitorImportIdentityKey, listReservedMonitorTargets } from "@/lib/monitors/service";
import { applyMonitorDefaults } from "@/lib/monitors/defaults";
import { applyImportDefaults } from "@/lib/monitors/import-defaults";
import { getSettings } from "@/lib/settings/service";
import { parseIntervalSetting, serializeMonitorRecord } from "@/lib/monitors/utils";
import { MAX_MONITORS_PER_USER, MONITOR_CSV_IMPORT_LIMITS } from "@/lib/import-limits";
import { readJsonBody } from "@/lib/http/json-body";
import { buildCanonicalMonitorTarget, buildMonitorIdentityKey } from "@/lib/monitors/targets";
import type { MonitorType } from "@/lib/monitors/types";
import { canUserAccessPrivateTargets } from "@/lib/security/network-policy";

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
    assertPermission(session.role, "monitors.manage");

    const body = (await readJsonBody(request, MONITOR_CSV_IMPORT_LIMITS.maxRequestBytes)) as {
      monitors?: unknown;
      source?: unknown;
      lineNumbers?: unknown;
    };
    const items: unknown[] = Array.isArray(body?.monitors) ? body.monitors : [];
    const preview = body && typeof body === "object" && "preview" in body && body.preview === true;
    const source = body?.source === "txt" ? "txt" : "csv";
    const lineNumbers = Array.isArray(body?.lineNumbers) ? body.lineNumbers : [];

    if (items.length === 0) {
      return NextResponse.json(
        { message: source === "txt" ? "Upload at least one domain." : "Upload at least one CSV row." },
        { status: 400 }
      );
    }

    if (items.length > MONITOR_CSV_IMPORT_LIMITS.maxRows) {
      return NextResponse.json(
        { message: `Import at most ${MONITOR_CSV_IMPORT_LIMITS.maxRows} monitors at a time.` },
        { status: 400 }
      );
    }

    const settings = await getSettings(session.id, true, session.activeWorkspaceId!);
    const intervalDefaults = parseIntervalSetting(settings?.monitoring.interval ?? "1m");

    const rows = items.map((item, index) => {
      const requestedLineNumber = lineNumbers[index];
      const lineNumber = typeof requestedLineNumber === "number"
        && Number.isInteger(requestedLineNumber)
        && requestedLineNumber > 0
        ? requestedLineNumber
        : source === "txt" ? index + 1 : index + 2;
      const withDefaults = applyMonitorDefaults(
        applyImportDefaults(item, settings, intervalDefaults),
        settings
      );
      const result = monitorInputSchema.safeParse(withDefaults);
      if (!result.success) {
        const issue = result.error.issues[0];
        const field = issue?.path.length ? `${issue.path.join(".")}: ` : "";
        const itemLabel = source === "txt" ? `Line ${lineNumber}` : `Row ${lineNumber}`;
        return { lineNumber, error: `${itemLabel}: ${field}${issue?.message ?? "Invalid monitor data."}`, input: null };
      }
      try {
        assertRestorablePostgresMonitorPasswords([result.data]);
        return { lineNumber, error: null, input: result.data };
      } catch (error) {
        return { lineNumber, error: error instanceof Error ? error.message : "Invalid monitor data.", input: null };
      }
    });

    if (preview) {
      const reserved = await listReservedMonitorTargets(session.id, undefined, session.activeWorkspaceId!);
      const allowPrivateTargets = await canUserAccessPrivateTargets(session.id, undefined, session.activeWorkspaceId!);
      const checkedRows = await Promise.all(rows.map(async (row) => {
        if (!row.input || row.error || row.input.monitorType === "heartbeat") return row;
        try {
          await assertMonitorNetworkTargetAllowed(
            row.input.monitorType,
            buildCanonicalMonitorTarget(row.input),
            allowPrivateTargets
          );
          return row;
        } catch (error) {
          return { ...row, error: error instanceof AuthError ? error.message : "Unable to validate monitor target." };
        }
      }));
      const seen = new Set(reserved.map((monitor) => buildMonitorIdentityKey({
        monitorType: monitor.monitorType as MonitorType,
        url: monitor.url,
      })));
      let additions = 0;
      const previewRows = checkedRows.map((row, index) => {
        const input = row.input;
        const identity = input ? getMonitorImportIdentityKey(input) : null;
        const duplicate = identity !== null && seen.has(identity);
        if (identity && !duplicate) seen.add(identity);
        const quotaExceeded = !row.error && !duplicate && reserved.length + additions >= MAX_MONITORS_PER_USER;
        if (!row.error && !duplicate && !quotaExceeded) additions++;
        const raw = items[index] && typeof items[index] === "object" ? items[index] as Record<string, unknown> : {};
        return {
          lineNumber: row.lineNumber,
          name: input?.name ?? (typeof raw.name === "string" ? raw.name : "—"),
          target: input?.url ?? (typeof raw.url === "string" ? raw.url : "—"),
          status: row.error || quotaExceeded ? "invalid" : duplicate ? "skipped" : "added",
          reason: row.error ?? (quotaExceeded ? "Workspace monitor limit would be exceeded." : duplicate ? "Target already exists or appears earlier in this file." : null),
        };
      });
      return NextResponse.json({
        preview: {
          rows: previewRows,
          added: previewRows.filter((row) => row.status === "added").length,
          skipped: previewRows.filter((row) => row.status === "skipped").length,
          invalid: previewRows.filter((row) => row.status === "invalid").length,
        },
      });
    }

    const invalid = rows.find((row) => row.error);
    if (invalid) throw new Error(invalid.error!);
    const parsed = rows.map((row) => row.input!);
    const created = await createManyMonitors(
      session.id,
      parsed,
      undefined,
      session.activeWorkspaceId!
    );

    return NextResponse.json({
      monitors: created.map(serializeMonitor),
    });
  } catch (error) {
    if (
      error instanceof Error
      && (
        error.message.startsWith("Row ")
        || error.message.startsWith("Line ")
        || error.message.includes("PostgreSQL monitor passwords are not included")
      )
    ) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    const authError = toAuthError(error, "Unable to import monitors right now.");
    return NextResponse.json({ message: authError.message }, { status: authError.status });
  }
}
