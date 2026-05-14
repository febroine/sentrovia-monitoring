"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_MONITOR_FORM, type MonitorPayload, type MonitorRecord } from "@/lib/monitors/types";

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
  "keywordQuery=keywordQuery",
  "keywordInvert=keywordInvert",
  "jsonPath=jsonPath",
  "jsonExpectedValue=jsonExpectedValue",
  "jsonMatchMode=jsonMatchMode",
  "company=company",
  "intervalValue=intervalValue",
  "intervalUnit=intervalUnit",
  "timeout=timeout",
  "retries=retries",
  "method=method",
  "tags=tags",
  "notificationPref=notificationPref",
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

    setFileName(file.name);
    setCsvText(await file.text());
    setError(null);
  }

  async function handleImport() {
    setSubmitting(true);
    setError(null);

    try {
      const rows = parseCsv(csvText);
      if (rows.length < 2) {
        throw new Error("CSV file must include a header row and at least one data row.");
      }

      const headers = rows[0];
      const monitors = rows.slice(1).filter((row) => row.some((cell) => cell.trim().length > 0)).map((row) => toPayload(headers, row, mapping));

      const response = await fetch("/api/monitors/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monitors }),
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
            Upload HTTP, TCP/port, or PostgreSQL monitors. Missing optional fields fall back to the workspace defaults.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex justify-end">
            <a href="/templates/monitors-template.csv" download className={buttonVariants({ variant: "outline", size: "sm" })}>Download sample CSV</a>
          </div>

          <div className="space-y-2">
            <Label>CSV file</Label>
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border p-6 text-center hover:border-primary/40 hover:bg-primary/5">
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
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
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

function parseCsv(input: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}

function toPayload(headers: string[], row: string[], mapping: Map<string, string>): MonitorPayload {
  const values = Object.fromEntries(headers.map((header, index) => [header.trim(), row[index]?.trim() ?? ""]));

  const read = (target: string) => values[mapping.get(target) ?? target] ?? "";
  const booleanValue = (target: string) => read(target).toLowerCase() === "true";
  const numberValue = (target: string, fallback: number) => {
    const raw = read(target);
    if (raw.length === 0) {
      return fallback;
    }

    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return {
    ...DEFAULT_MONITOR_FORM,
    name: read("name"),
    monitorType: (read("monitorType") || DEFAULT_MONITOR_FORM.monitorType) as MonitorPayload["monitorType"],
    url: read("url"),
    portHost: read("portHost"),
    portNumber: numberValue("portNumber", DEFAULT_MONITOR_FORM.portNumber),
    databaseHost: read("databaseHost"),
    databasePort: numberValue("databasePort", DEFAULT_MONITOR_FORM.databasePort),
    databaseName: read("databaseName"),
    databaseUsername: read("databaseUsername"),
    databasePassword: read("databasePassword"),
    databasePasswordConfigured: booleanValue("databasePasswordConfigured"),
    databaseSsl: read("databaseSsl") ? booleanValue("databaseSsl") : DEFAULT_MONITOR_FORM.databaseSsl,
    keywordQuery: read("keywordQuery"),
    keywordInvert: booleanValue("keywordInvert"),
    jsonPath: read("jsonPath"),
    jsonExpectedValue: read("jsonExpectedValue"),
    jsonMatchMode: (read("jsonMatchMode") || DEFAULT_MONITOR_FORM.jsonMatchMode) as MonitorPayload["jsonMatchMode"],
    company: read("company"),
    notificationPref: (read("notificationPref") || DEFAULT_MONITOR_FORM.notificationPref) as MonitorPayload["notificationPref"],
    notifEmail: read("notifEmail"),
    telegramBotToken: read("telegramBotToken"),
    telegramChatId: read("telegramChatId"),
    intervalValue: numberValue("intervalValue", DEFAULT_MONITOR_FORM.intervalValue),
    intervalUnit: (read("intervalUnit") || DEFAULT_MONITOR_FORM.intervalUnit) as MonitorPayload["intervalUnit"],
    timeout: numberValue("timeout", DEFAULT_MONITOR_FORM.timeout),
    retries: numberValue("retries", DEFAULT_MONITOR_FORM.retries),
    method: (read("method") || DEFAULT_MONITOR_FORM.method) as MonitorPayload["method"],
    tags: read("tags").split("|").map((tag) => tag.trim()).filter(Boolean),
    renotifyCount: read("renotifyCount") ? Number(read("renotifyCount")) : null,
    maxRedirects: numberValue("maxRedirects", DEFAULT_MONITOR_FORM.maxRedirects),
    ipFamily: (read("ipFamily") || DEFAULT_MONITOR_FORM.ipFamily) as MonitorPayload["ipFamily"],
    checkSslExpiry: booleanValue("checkSslExpiry"),
    ignoreSslErrors: read("ignoreSslErrors") ? booleanValue("ignoreSslErrors") : DEFAULT_MONITOR_FORM.ignoreSslErrors,
    cacheBuster: booleanValue("cacheBuster"),
    saveErrorPages: booleanValue("saveErrorPages"),
    saveSuccessPages: booleanValue("saveSuccessPages"),
    responseMaxLength: numberValue("responseMaxLength", DEFAULT_MONITOR_FORM.responseMaxLength),
    telegramTemplate: read("telegramTemplate") || DEFAULT_MONITOR_FORM.telegramTemplate,
    emailSubject: read("emailSubject") || DEFAULT_MONITOR_FORM.emailSubject,
    emailBody: read("emailBody") || DEFAULT_MONITOR_FORM.emailBody,
    isActive: read("isActive") ? booleanValue("isActive") : DEFAULT_MONITOR_FORM.isActive,
  };
}
