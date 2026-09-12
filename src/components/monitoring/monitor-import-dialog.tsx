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

  async function handleImport() {
    setSubmitting(true);
    setError(null);

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
        }),
      });
      const data = (await response.json()) as { message?: string; monitors?: MonitorRecord[] };

      if (!response.ok || !data.monitors) {
        throw new Error(data.message ?? "Unable to import CSV.");
      }

      onImported(data.monitors);
      onOpenChange(false);
      setFileName(null);
      setCsvText("");
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
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void handleFileChange(event)} />
            </label>
          </div>

          <div className="space-y-2">
            <Label>Column mapping</Label>
            <Textarea rows={8} value={mappingText} onChange={(event) => setMappingText(event.target.value)} className="max-h-[240px] font-mono text-xs" />
          </div>

          {error ? (
            <div role="alert" aria-live="polite" className="rounded-md bg-destructive/10 px-3 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void handleImport()} disabled={submitting || !csvText}>
            {submitting ? "Importing..." : "Import CSV"}
          </Button>
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
