"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MONITOR_CSV_IMPORT_LIMITS } from "@/lib/import-limits";
import { parseMonitorCsv, toMonitorImportRecord } from "@/lib/monitors/csv-import";
import type { MonitorRecord } from "@/lib/monitors/types";

const DEFAULT_MAPPING = [
  "name=name",
  "monitorType=monitorType",
  "url=url",
  "portHost=portHost",
  "portNumber=portNumber",
  "databaseHost=databaseHost",
  "databasePort=databasePort",
  "databaseName=databaseName",
  "databaseUsername=databaseUsername",
  "databasePassword=databasePassword",
  "databaseSsl=databaseSsl",
  "databaseTlsVerify=databaseTlsVerify",
  "keywordQuery=keywordQuery",
  "keywordInvert=keywordInvert",
  "jsonPath=jsonPath",
  "jsonExpectedValue=jsonExpectedValue",
  "jsonMatchMode=jsonMatchMode",
  "company=company",
  "intervalValue=intervalValue",
  "intervalUnit=intervalUnit",
  "timeout=timeout",
  "slowResponseThresholdMs=slowResponseThresholdMs",
  "slowResponseAlertsEnabled=slowResponseAlertsEnabled",
  "expectedStatusCodes=expectedStatusCodes",
  "retries=retries",
  "method=method",
  "tags=tags",
  "notificationPref=notificationPref",
  "notificationLanguage=notificationLanguage",
  "notifEmail=notifEmail",
  "telegramChatId=telegramChatId",
  "maxRedirects=maxRedirects",
  "ipFamily=ipFamily",
  "checkSslExpiry=checkSslExpiry",
  "ignoreSslErrors=ignoreSslErrors",
  "cacheBuster=cacheBuster",
  "saveErrorPages=saveErrorPages",
  "saveSuccessPages=saveSuccessPages",
  "responseMaxLength=responseMaxLength",
  "isActive=isActive",
  "publishOnStatusPage=publishOnStatusPage",
].join("\n");

export function MonitorImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (monitors: MonitorRecord[]) => void;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [mappingText, setMappingText] = useState(DEFAULT_MAPPING);
  const [csvText, setCsvText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    added: number;
    skipped: number;
    invalid: number;
    rows: Array<{ lineNumber: number; name: string; target: string; status: "added" | "skipped" | "invalid"; reason: string | null }>;
  } | null>(null);

  const mapping = useMemo(() => {
    const entries = mappingText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split("="))
      .filter((parts): parts is [string, string] => parts.length === 2);

    return new Map(entries.map(([target, source]) => [target.trim(), source.trim()]));
  }, [mappingText]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview(null);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      event.target.value = "";
      setFileName(null);
      setCsvText("");
      setError("Choose a .csv file.");
      return;
    }

    if (file.size > MONITOR_CSV_IMPORT_LIMITS.maxFileBytes) {
      event.target.value = "";
      setFileName(null);
      setCsvText("");
      setError(`CSV file is too large. Choose a file no larger than ${MONITOR_CSV_IMPORT_LIMITS.maxFileBytesLabel}.`);
      return;
    }

    try {
      setFileName(file.name);
      setCsvText(await file.text());
      setError(null);
    } catch {
      setFileName(null);
      setCsvText("");
      setError("Unable to read the selected CSV file.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleImport(previewOnly: boolean) {
    setSubmitting(true);
    setError(null);
    if (previewOnly) setPreview(null);

    try {
      const rows = parseMonitorCsv(csvText);
      if (rows.length < 2) {
        throw new Error("CSV file must include a header row and at least one data row.");
      }

      const headers = rows[0];
      const importRows = rows
        .slice(1)
        .map((row, index) => ({ row, lineNumber: index + 2 }))
        .filter(({ row }) => row.some((cell) => cell.trim().length > 0));
      const monitors = importRows.map(({ row }) => toMonitorImportRecord(headers, row, mapping));

      const response = await fetch("/api/monitors/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monitors,
          lineNumbers: importRows.map(({ lineNumber }) => lineNumber),
          preview: previewOnly,
        }),
      });
      const data = (await response.json()) as { message?: string; monitors?: MonitorRecord[]; preview?: NonNullable<typeof preview> };

      if (!response.ok) {
        throw new Error(data.message ?? (previewOnly ? "Unable to preview CSV." : "Unable to import CSV."));
      }
      if (previewOnly) {
        if (!data.preview) throw new Error("Unable to preview CSV.");
        setPreview(data.preview);
        return;
      }
      if (!data.monitors) throw new Error("Unable to import CSV.");

      onImported(data.monitors);
      onOpenChange(false);
      setFileName(null);
      setCsvText("");
      setPreview(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to import CSV.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[min(92vw,42rem)] max-w-[calc(100vw-2rem)] overflow-hidden p-0 sm:max-w-2xl">
        <div className="max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import CSV
          </DialogTitle>
          <DialogDescription>
            A minimal file only needs name and url. Monitor type defaults to HTTP, and other missing columns use workspace defaults.
            Import accepts up to {MONITOR_CSV_IMPORT_LIMITS.maxRows} monitor rows per CSV file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex justify-end">
            <a href="/templates/monitors-template.csv" download className={buttonVariants({ variant: "outline", size: "sm" })}>Download sample CSV</a>
          </div>

          <div className="space-y-2">
            <Label>CSV file</Label>
            <p className="text-xs text-muted-foreground">
              Limit: {MONITOR_CSV_IMPORT_LIMITS.maxRows} monitor rows per import.
            </p>
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg bg-muted/25 p-6 text-center hover:bg-primary/10">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{fileName ?? "Choose a CSV file"}</p>
                <p className="text-xs text-muted-foreground">Accepted format: `.csv`</p>
              </div>
              <input type="file" accept=".csv,text/csv" className="hidden" disabled={submitting} onChange={(event) => void handleFileChange(event)} />
            </label>
          </div>

          <div className="space-y-2">
            <Label>Column mapping</Label>
            <Textarea rows={8} value={mappingText} disabled={submitting} onChange={(event) => { setMappingText(event.target.value); setPreview(null); }} className="max-h-[240px] font-mono text-xs" />
          </div>

          {preview ? (
            <div className="space-y-2">
              <p className="text-sm font-medium" role="status" aria-live="polite">Preview: {preview.added} to add · {preview.skipped} skipped · {preview.invalid} invalid</p>
              <p className="text-xs text-muted-foreground">Import checks the file again before saving. Fix invalid rows to continue.</p>
              <div className="max-h-56 overflow-auto rounded-md border border-border/60">
                <table className="w-full text-left text-xs">
                  <thead><tr className="border-b border-border/60"><th className="p-2">Row</th><th className="p-2">Monitor</th><th className="p-2">Result</th></tr></thead>
                  <tbody>{preview.rows.map((row) => (
                    <tr key={row.lineNumber} className="border-b border-border/40 last:border-0">
                      <td className="p-2 align-top tabular-nums">{row.lineNumber}</td>
                      <td className="min-w-0 p-2 align-top"><span className="block break-all font-medium">{row.name}</span><span className="block break-all text-muted-foreground">{row.target}</span></td>
                      <td className="p-2 align-top"><span>{row.status === "added" ? "Add" : row.status === "skipped" ? "Skip" : "Invalid"}</span>{row.reason ? <span className="mt-1 block text-muted-foreground">{row.reason}</span> : null}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          ) : null}

          {error ? (
            <div role="alert" aria-live="polite" className="rounded-md bg-destructive/10 px-3 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" onClick={() => void handleImport(true)} disabled={submitting || !csvText}>
            {submitting ? "Working..." : preview ? "Refresh preview" : "Preview CSV"}
          </Button>
          <Button onClick={() => void handleImport(false)} disabled={submitting || !preview || preview.invalid > 0 || preview.added === 0}>
            {preview ? `Import ${preview.added} monitor${preview.added === 1 ? "" : "s"}` : "Import CSV"}
          </Button>
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
