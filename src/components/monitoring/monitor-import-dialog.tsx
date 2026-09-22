"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Pencil, RotateCcw, Upload } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MONITOR_CSV_IMPORT_LIMITS } from "@/lib/import-limits";
import { parseMonitorCsv, replaceMonitorCsvCell, toMonitorImportRecord } from "@/lib/monitors/csv-import";
import type { MonitorRecord } from "@/lib/monitors/types";
import { formatPanelDateTime } from "@/lib/time";

const DEFAULT_MAPPING = [
  "name=name", "monitorType=monitorType", "url=url", "portHost=portHost", "portNumber=portNumber",
  "databaseHost=databaseHost", "databasePort=databasePort", "databaseName=databaseName",
  "databaseUsername=databaseUsername", "databasePassword=databasePassword", "databaseSsl=databaseSsl",
  "databaseTlsVerify=databaseTlsVerify", "keywordQuery=keywordQuery", "keywordInvert=keywordInvert",
  "jsonPath=jsonPath", "jsonExpectedValue=jsonExpectedValue", "jsonMatchMode=jsonMatchMode",
  "company=company", "intervalValue=intervalValue", "intervalUnit=intervalUnit", "timeout=timeout",
  "slowResponseThresholdMs=slowResponseThresholdMs", "slowResponseAlertsEnabled=slowResponseAlertsEnabled",
  "expectedStatusCodes=expectedStatusCodes", "retries=retries", "method=method", "tags=tags",
  "notificationPref=notificationPref", "notificationLanguage=notificationLanguage", "notifEmail=notifEmail",
  "telegramChatId=telegramChatId", "maxRedirects=maxRedirects", "ipFamily=ipFamily",
  "checkSslExpiry=checkSslExpiry", "ignoreSslErrors=ignoreSslErrors", "cacheBuster=cacheBuster",
  "saveErrorPages=saveErrorPages", "saveSuccessPages=saveSuccessPages", "responseMaxLength=responseMaxLength",
  "isActive=isActive", "publishOnStatusPage=publishOnStatusPage",
].join("\n");

type Preview = {
  added: number;
  skipped: number;
  invalid: number;
  rows: Array<{ lineNumber: number; name: string; target: string; status: "added" | "skipped" | "invalid"; reason: string | null }>;
};

type ImportRun = {
  id: string;
  fileName: string;
  source: string;
  addedCount: number;
  skippedCount: number;
  invalidCount: number;
  status: "completed" | "undone";
  undoneAt: string | null;
  createdAt: string;
};

export function MonitorImportDialog({ open, onOpenChange, onImported }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (monitors: MonitorRecord[]) => void;
}) {
  const [tab, setTab] = useState<"import" | "history">("import");
  const [fileName, setFileName] = useState<string | null>(null);
  const [mappingText, setMappingText] = useState(DEFAULT_MAPPING);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewStale, setPreviewStale] = useState(false);
  const [editingLine, setEditingLine] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [confirmUndoId, setConfirmUndoId] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const mapping = useMemo(() => {
    const entries = mappingText.split("\n").map((line) => line.trim()).filter(Boolean)
      .map((line) => line.split("=")).filter((parts): parts is [string, string] => parts.length === 2);
    return new Map(entries.map(([target, source]) => [target.trim(), source.trim()]));
  }, [mappingText]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch("/api/monitors/imports", { cache: "no-store" });
      const data = (await response.json()) as { runs?: ImportRun[]; message?: string };
      if (!response.ok) throw new Error(data.message ?? "Unable to load import history.");
      setHistory(data.runs ?? []);
    } catch (caughtError) {
      setHistoryError(caughtError instanceof Error ? caughtError.message : "Unable to load import history.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadHistory();
  }, [loadHistory, open]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreview(null);
    setPreviewStale(false);
    setNotice(null);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      event.target.value = "";
      setFileName(null);
      setCsvRows([]);
      setError("Choose a .csv file.");
      return;
    }
    if (file.size > MONITOR_CSV_IMPORT_LIMITS.maxFileBytes) {
      event.target.value = "";
      setFileName(null);
      setCsvRows([]);
      setError(`CSV file is too large. Choose a file no larger than ${MONITOR_CSV_IMPORT_LIMITS.maxFileBytesLabel}.`);
      return;
    }
    try {
      const rows = parseMonitorCsv(await file.text());
      if (rows.length < 2) throw new Error("CSV file must include a header row and at least one data row.");
      setFileName(file.name);
      setCsvRows(rows);
      setError(null);
    } catch (caughtError) {
      setFileName(null);
      setCsvRows([]);
      setError(caughtError instanceof Error ? caughtError.message : "Unable to read the selected CSV file.");
    } finally {
      event.target.value = "";
    }
  }

  function buildImportPayload() {
    if (csvRows.length < 2) throw new Error("CSV file must include a header row and at least one data row.");
    const headers = csvRows[0];
    const importRows = csvRows.slice(1).map((row, index) => ({ row, lineNumber: index + 2 }))
      .filter(({ row }) => row.some((cell) => cell.trim().length > 0));
    return {
      monitors: importRows.map(({ row }) => toMonitorImportRecord(headers, row, mapping)),
      lineNumbers: importRows.map(({ lineNumber }) => lineNumber),
    };
  }

  async function handleImport(previewOnly: boolean) {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    if (previewOnly) setPreview(null);
    try {
      const payload = buildImportPayload();
      const response = await fetch("/api/monitors/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, preview: previewOnly, fileName }),
      });
      const data = (await response.json()) as { message?: string; monitors?: MonitorRecord[]; preview?: Preview };
      if (!response.ok) throw new Error(data.message ?? (previewOnly ? "Unable to preview CSV." : "Unable to import CSV."));
      if (previewOnly) {
        if (!data.preview) throw new Error("Unable to preview CSV.");
        setPreview(data.preview);
        setPreviewStale(false);
        setEditingLine(null);
        return;
      }
      if (!data.monitors) throw new Error("Unable to import CSV.");
      onImported(data.monitors);
      setNotice(`Imported ${data.monitors.length} monitor${data.monitors.length === 1 ? "" : "s"}.`);
      setFileName(null);
      setCsvRows([]);
      setPreview(null);
      setPreviewStale(false);
      await loadHistory();
      setTab("history");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to import CSV.");
    } finally {
      setSubmitting(false);
    }
  }

  function updateCell(lineNumber: number, columnIndex: number, value: string) {
    setCsvRows((current) => replaceMonitorCsvCell(current, lineNumber, columnIndex, value));
    setPreviewStale(true);
  }

  function downloadErrors() {
    if (!preview || csvRows.length === 0) return;
    const invalid = preview.rows.filter((row) => row.status === "invalid");
    const output = [
      [...csvRows[0], "_importError"],
      ...invalid.map((item) => [
        ...Array.from({ length: csvRows[0].length }, (_, columnIndex) => csvRows[item.lineNumber - 1]?.[columnIndex] ?? ""),
        item.reason ?? "Invalid row",
      ]),
    ];
    const blob = new Blob([stringifyCsv(output)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(fileName ?? "monitor-import").replace(/\.csv$/i, "")}-errors.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function undoImport(runId: string) {
    setUndoingId(runId);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/monitors/imports/${runId}/undo`, { method: "POST" });
      const data = (await response.json()) as { removedCount?: number; message?: string };
      if (!response.ok) throw new Error(data.message ?? "Unable to undo this import.");
      setNotice(`Removed ${data.removedCount ?? 0} imported monitor${data.removedCount === 1 ? "" : "s"}.`);
      setConfirmUndoId(null);
      await loadHistory();
      onImported([]);
    } catch (caughtError) {
      setHistoryError(caughtError instanceof Error ? caughtError.message : "Unable to undo this import.");
    } finally {
      setUndoingId(null);
    }
  }

  const latestCompletedId = history.find((run) => run.status === "completed")?.id ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[min(94vw,52rem)] max-w-[calc(100vw-2rem)] overflow-hidden p-0 sm:max-w-3xl">
        <div className="max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileSpreadsheet aria-hidden="true" className="size-5 text-primary" />Import monitors</DialogTitle>
            <DialogDescription>Preview CSV rows before saving, correct invalid rows, or undo the latest completed import.</DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex border-b" role="tablist" aria-label="Monitor import views">
            {(["import", "history"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`border-b-2 px-4 py-2 text-sm font-medium ${tab === value ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{value === "import" ? "Import CSV" : "History"}</button>)}
          </div>

          {notice ? <p role="status" className="mt-4 rounded-sm bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p> : null}

          {tab === "import" ? (
            <div className="mt-5 space-y-5">
              <div className="flex justify-end"><a href="/templates/monitors-template.csv" download className={buttonVariants({ variant: "outline", size: "sm" })}>Download sample CSV</a></div>
              <div className="space-y-2">
                <Label htmlFor="monitor-csv-file">CSV file</Label>
                <label htmlFor="monitor-csv-file" className="flex cursor-pointer flex-col items-center gap-3 rounded-md border border-dashed border-border/80 p-6 text-center hover:bg-muted/40">
                  <Upload aria-hidden="true" className="size-7 text-muted-foreground" />
                  <span><span className="block text-sm font-medium">{fileName ?? "Choose a CSV file"}</span><span className="block text-xs text-muted-foreground">Up to {MONITOR_CSV_IMPORT_LIMITS.maxRows} monitor rows</span></span>
                </label>
                <input id="monitor-csv-file" type="file" accept=".csv,text/csv" className="sr-only" disabled={submitting} onChange={(event) => void handleFileChange(event)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="monitor-csv-mapping">Column mapping</Label>
                <Textarea id="monitor-csv-mapping" rows={7} value={mappingText} disabled={submitting} onChange={(event) => { setMappingText(event.target.value); setPreview(null); setPreviewStale(false); }} className="max-h-56 font-mono text-xs" />
              </div>

              {preview ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium" role="status" aria-live="polite">Preview: {preview.added} to add · {preview.skipped} skipped · {preview.invalid} invalid</p>
                    {preview.invalid > 0 ? <Button type="button" variant="outline" size="sm" onClick={downloadErrors}><Download aria-hidden="true" className="size-4" />Download errors</Button> : null}
                  </div>
                  {previewStale ? <p className="text-xs text-amber-700 dark:text-amber-300">Rows changed. Refresh the preview before importing.</p> : <p className="text-xs text-muted-foreground">Import validates the file again before saving.</p>}
                  <div className="max-h-80 overflow-auto border-y border-border/70">
                    <table className="w-full min-w-[620px] text-left text-xs">
                      <thead className="sticky top-0 bg-background"><tr className="border-b"><th className="p-2">Row</th><th className="p-2">Monitor</th><th className="p-2">Result</th><th className="p-2"><span className="sr-only">Actions</span></th></tr></thead>
                      <tbody>{preview.rows.map((row) => (
                        <Fragment key={row.lineNumber}>
                          <tr className="border-b border-border/40">
                            <td className="p-2 align-top tabular-nums">{row.lineNumber}</td>
                            <td className="min-w-0 p-2 align-top"><span className="block break-all font-medium">{row.name}</span><span className="block break-all text-muted-foreground">{row.target}</span></td>
                            <td className="p-2 align-top"><span>{row.status === "added" ? "Add" : row.status === "skipped" ? "Skip" : "Invalid"}</span>{row.reason ? <span className="mt-1 block text-muted-foreground">{row.reason}</span> : null}</td>
                            <td className="p-2 text-right align-top">{row.status === "invalid" ? <Button type="button" variant="ghost" size="sm" onClick={() => setEditingLine(editingLine === row.lineNumber ? null : row.lineNumber)}><Pencil aria-hidden="true" className="size-3.5" />Edit row</Button> : null}</td>
                          </tr>
                          {editingLine === row.lineNumber ? <tr key={`edit-${row.lineNumber}`} className="border-b bg-muted/20"><td colSpan={4} className="p-3"><div className="grid gap-3 sm:grid-cols-2">{csvRows[0].map((header, columnIndex) => <Label key={`${header}-${columnIndex}`} className="space-y-1 text-xs"><span className="block truncate" title={header}>{header || `Column ${columnIndex + 1}`}</span><Input value={csvRows[row.lineNumber - 1]?.[columnIndex] ?? ""} onChange={(event) => updateCell(row.lineNumber, columnIndex, event.target.value)} className="h-9 text-xs" /></Label>)}</div></td></tr> : null}
                        </Fragment>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              {error ? <p role="alert" className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
              <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button variant="outline" onClick={() => void handleImport(true)} disabled={submitting || csvRows.length < 2}>{submitting ? "Working…" : preview ? "Refresh preview" : "Preview CSV"}</Button>
                <Button onClick={() => void handleImport(false)} disabled={submitting || !preview || previewStale || preview.invalid > 0 || preview.added === 0}>{preview ? `Import ${preview.added} monitor${preview.added === 1 ? "" : "s"}` : "Import CSV"}</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {historyError ? <p role="alert" className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">{historyError}</p> : null}
              {historyLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading import history…</p> : null}
              {!historyLoading && history.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No monitor imports have been recorded yet.</p> : null}
              {!historyLoading && history.length > 0 ? <div className="divide-y border-y">{history.map((run) => (
                <div key={run.id} className="py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0"><p className="truncate text-sm font-medium" title={run.fileName}>{run.fileName}</p><p className="mt-1 text-xs text-muted-foreground">{formatPanelDateTime(run.createdAt)} · {run.addedCount} added · {run.skippedCount} skipped{run.status === "undone" ? " · Undone" : ""}</p></div>
                    {run.id === latestCompletedId ? (
                      confirmUndoId === run.id ? <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Remove {run.addedCount} monitors?</span><Button size="sm" variant="outline" onClick={() => setConfirmUndoId(null)}>Cancel</Button><Button size="sm" variant="destructive" disabled={undoingId === run.id} onClick={() => void undoImport(run.id)}>{undoingId === run.id ? "Removing…" : "Confirm undo"}</Button></div>
                      : <Button size="sm" variant="outline" onClick={() => setConfirmUndoId(run.id)}><RotateCcw aria-hidden="true" className="size-4" />Undo import</Button>
                    ) : null}
                  </div>
                </div>
              ))}</div> : null}
              <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function stringifyCsv(rows: string[][]) {
  return rows.map((row) => row.map((value) => {
    const escaped = value.replace(/"/g, '""');
    return /[",\r\n]/.test(value) ? `"${escaped}"` : escaped;
  }).join(",")).join("\r\n");
}
