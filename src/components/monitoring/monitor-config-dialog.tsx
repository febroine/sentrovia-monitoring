"use client";

import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MONITOR_CONFIG_IMPORT_LIMITS } from "@/lib/import-limits";
import { toEnglishUppercase } from "@/lib/text/casing";

type MonitorImportPreview = {
  items: Array<{
    index: number;
    name: string;
    target: string;
    status: "added" | "skipped" | "invalid";
    reason: string | null;
  }>;
  summary: { added: number; skipped: number; invalid: number };
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
        body: JSON.stringify({ format, content, mode }),
      });
      const data = (await response.json().catch(() => null)) as {
        message?: string;
        preview?: MonitorImportPreview;
        monitors?: unknown[];
      } | null;

      if (!response.ok) {
        setMessage(data?.message ?? "Unable to import monitor configuration.");
        return;
      }

      if (mode === "preview") {
        setPreview(data?.preview ?? null);
        setMessage(data?.preview ? "Import preview is ready. Review the changes before applying." : null);
      } else {
        setMessage(`Imported ${data?.monitors?.length ?? 0} monitor(s).`);
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
        <DialogHeader className="border-b px-6 py-5">
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
              <div className="space-y-2">
                <Label>Format</Label>
                <Select value={format} onValueChange={(value) => {
                  setFormat(value as "json" | "yaml");
                  setPreview(null);
                }}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="yaml">YAML</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Button variant="outline" className="h-10 min-w-[140px]" onClick={() => void handleExport()}>
                  <Download data-icon="inline-start" />
                  Export bundle
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Import bundle</Label>
              <p className="text-xs text-muted-foreground">
                Limit: {MONITOR_CONFIG_IMPORT_LIMITS.maxBytesLabel},{" "}
                {MONITOR_CONFIG_IMPORT_LIMITS.maxMonitors} monitors per import.
              </p>
              <Textarea
                rows={16}
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  setPreview(null);
                }}
                placeholder="Paste a Sentrovia monitor bundle in JSON or YAML format."
                className="min-h-[22rem] max-h-[48vh] resize-none overflow-y-auto font-mono text-xs"
              />
            </div>

            {message ? <div className="rounded-lg border px-3 py-2 text-sm">{message}</div> : null}
            {preview ? (
              <div className="space-y-3 rounded-lg border bg-muted/10 p-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <PreviewCount label="Add" value={preview.summary.added} tone="text-emerald-600" />
                  <PreviewCount label="Skip" value={preview.summary.skipped} tone="text-amber-600" />
                  <PreviewCount label="Invalid" value={preview.summary.invalid} tone="text-destructive" />
                </div>
                <div className="max-h-52 space-y-2 overflow-y-auto">
                  {preview.items.map((item) => (
                    <div key={`${item.index}-${item.target}`} className="flex items-start justify-between gap-3 rounded-md border bg-background px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{item.target}</p>
                        {item.reason ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{item.reason}</p> : null}
                      </div>
                      <span className={item.status === "added" ? "text-xs font-medium text-emerald-600" : item.status === "invalid" ? "text-xs font-medium text-destructive" : "text-xs font-medium text-amber-600"}>
                        {item.status === "added" ? "Add" : item.status === "invalid" ? "Invalid" : "Skip"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t bg-background px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            onClick={() => void handleImport(preview ? "apply" : "preview")}
            disabled={submitting || !content.trim() || Boolean(preview && preview.summary.added === 0)}
          >
            <Upload data-icon="inline-start" />
            {submitting
              ? preview ? "Importing..." : "Analyzing..."
              : preview ? `Import ${preview.summary.added}` : "Preview import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewCount({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <p className={`text-lg font-semibold ${tone}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
