"use client";

import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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

  async function handleExport() {
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
    setMessage(`Monitor configuration exported as ${format.toUpperCase()}.`);
  }

  async function handleImport() {
    setSubmitting(true);
    setMessage(null);

    const response = await fetch("/api/monitors/config/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, content }),
    });
    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setMessage(data.message ?? "Unable to import monitor configuration.");
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    setMessage("Monitor configuration imported.");
    setContent("");
    onImported();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Monitoring as Code</DialogTitle>
          <DialogDescription>Export the current monitor fleet or paste a JSON/YAML bundle to restore declarative monitor definitions.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-end">
            <div className="space-y-2">
              <Label>Format</Label>
              <Select value={format} onValueChange={(value) => setFormat(value as "json" | "yaml")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="yaml">YAML</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void handleExport()}>
                <Download data-icon="inline-start" />
                Export bundle
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Import bundle</Label>
            <Textarea
              rows={16}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Paste a Sentrovia monitor bundle in JSON or YAML format."
              className="font-mono text-xs"
            />
          </div>

          {message ? <div className="rounded-lg border px-3 py-2 text-sm">{message}</div> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => void handleImport()} disabled={submitting || !content.trim()}>
            <Upload data-icon="inline-start" />
            {submitting ? "Importing..." : "Import bundle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
