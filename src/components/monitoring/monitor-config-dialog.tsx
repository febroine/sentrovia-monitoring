"use client";

import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MONITOR_CONFIG_IMPORT_LIMITS } from "@/lib/import-limits";
import { toEnglishUppercase } from "@/lib/text/casing";

type MonitorImportPreview = {
  items: Array<{
    index: number;
    name: string;
    target: string;
    status: "added" | "updated" | "skipped" | "invalid";
    reason: string | null;
    changedFields?: string[];
  }>;
  summary: { added: number; updated: number; skipped: number; invalid: number };
};

export function MonitorConfigDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [format, setFormat] = useState<"json" | "yaml">("json");
  const [content, setContent] = useState("");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<MonitorImportPreview | null>(null);

  async function handleExport() {
    try {
      const response = await fetch(`/api/monitors/config/export?format=${format}`, { cache: "no-store" });
      const text = await response.text();

      if (!response.ok) {
        setMessage("Unable to export monitor configuration.");
        return;
      }

      const blob = new Blob([text], { type: format === "yaml" ? "application/yaml" : "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sentrovia-monitors.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(`Monitor configuration exported as ${toEnglishUppercase(format)}.`);
    } catch {
      setMessage("Unable to export monitor configuration.");
    }
  }

  async function handleImport(mode: "preview" | "apply") {
    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/monitors/config/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, content, mode, updateExisting }),
      });
      const data = (await response.json().catch(() => null)) as {
        message?: string;
        preview?: MonitorImportPreview;
        monitors?: unknown[];
        updated?: unknown[];
      } | null;

      if (!response.ok) {
        setMessage(data?.message ?? "Unable to import monitor configuration.");
        return;
      }

      if (mode === "preview") {
        setPreview(data?.preview ?? null);
        setMessage(data?.preview ? "Import preview is ready. Review the changes before applying." : null);
      } else {
        setMessage(`Added ${data?.monitors?.length ?? 0}, updated ${data?.updated?.length ?? 0} monitor(s).`);
        setContent("");
        setPreview(null);
        onImported();
      }
    } catch {
      setMessage("Unable to import monitor configuration.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="bg-muted/20 px-6 py-5">
          <DialogTitle>Monitoring as Code</DialogTitle>
          <DialogDescription>
            Export the current monitor fleet or paste a JSON/YAML bundle to restore declarative monitor definitions.
            Import accepts up to {MONITOR_CONFIG_IMPORT_LIMITS.maxBytesLabel} and{" "}
            {MONITOR_CONFIG_IMPORT_LIMITS.maxMonitors} monitors.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-end">
              <div className="flex flex-col gap-2">
                <Label htmlFor="monitor-config-format">Format</Label>
                <Select value={format} onValueChange={(value) => {
                  setFormat(value as "json" | "yaml");
                  setPreview(null);
                }}>
                  <SelectTrigger id="monitor-config-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="yaml">YAML</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Button variant="outline" className="min-w-[140px]" onClick={() => void handleExport()}>
                  <Download data-icon="inline-start" />
                  Export bundle
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="monitor-config-content">Import bundle</Label>
              <p className="text-xs text-muted-foreground">
                Limit: {MONITOR_CONFIG_IMPORT_LIMITS.maxBytesLabel},{" "}
                {MONITOR_CONFIG_IMPORT_LIMITS.maxMonitors} monitors per import.
              </p>
              <Textarea
                id="monitor-config-content"
                rows={16}
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  setPreview(null);
                }}
                placeholder="Paste a Sentrovia monitor bundle in JSON or YAML format…"
                className="min-h-[22rem] max-h-[48vh] resize-none overflow-y-auto font-mono text-xs"
              />
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
              <div>
                <Label htmlFor="monitor-config-update-existing">Update matching monitors</Label>
                <p className="mt-1 text-xs text-muted-foreground">Match by exported ID or target. Existing secrets stay in place.</p>
                {updateExisting ? <p className="mt-1 text-xs text-muted-foreground">To replace a redacted Telegram routing preference, set applyRedactedNotificationPref: true on that monitor.</p> : null}
              </div>
              <Switch id="monitor-config-update-existing" checked={updateExisting} onCheckedChange={(checked) => {
                setUpdateExisting(checked);
                setPreview(null);
              }} />
            </div>

            {message ? <div className="rounded-md bg-primary/10 px-3 py-3 text-sm">{message}</div> : null}
            {preview ? (
              <div className="space-y-3 rounded-md bg-muted/20 p-4">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
                  <span>Add {preview.summary.added}</span>
                  <span>Update {preview.summary.updated}</span>
                  <span>Skip {preview.summary.skipped}</span>
                  <span>Invalid {preview.summary.invalid}</span>
                </div>
                <div className="max-h-52 space-y-2 overflow-y-auto">
                  {preview.items.map((item) => (
                    <div key={`${item.index}-${item.target}`} className="flex items-start justify-between gap-3 rounded-md bg-background px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.target}</p>
                        {item.changedFields?.length ? <p className="mt-1 text-xs text-muted-foreground">Changes: {item.changedFields.map((field) => field.replace(/([A-Z])/g, " $1").trim().toLowerCase()).join(", ")}</p> : null}
                        {item.reason ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{item.reason}</p> : null}
                      </div>
                      <span className={item.status === "invalid" ? "text-xs font-medium text-destructive" : "text-xs font-medium text-muted-foreground"}>
                        {item.status === "added" ? "Add" : item.status === "updated" ? "Update" : item.status === "invalid" ? "Invalid" : "Skip"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

         <DialogFooter className="m-0 shrink-0 rounded-none border-t bg-background px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            onClick={() => void handleImport(preview ? "apply" : "preview")}
            disabled={submitting || !content.trim() || Boolean(
              preview && (
                preview.summary.invalid > 0
                || preview.summary.added + preview.summary.updated === 0
              )
            )}
          >
            <Upload data-icon="inline-start" />
            {submitting
              ? preview ? "Importing…" : "Analyzing…"
              : preview ? `Apply ${preview.summary.added + preview.summary.updated}` : "Preview import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
