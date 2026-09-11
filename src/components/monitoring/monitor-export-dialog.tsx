"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { showToast } from "@/lib/client-toast";
import type { MonitorExportFormat } from "@/lib/monitors/export";

type ExportScope = "all" | "selected";

export function MonitorExportDialog({
  open,
  onOpenChange,
  selectedIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
}) {
  const [scope, setScope] = useState<ExportScope>(selectedIds.length > 0 ? "selected" : "all");
  const [format, setFormat] = useState<MonitorExportFormat>("xlsx");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedScopeUnavailable = selectedIds.length === 0;
  const effectiveScope = selectedScopeUnavailable && scope === "selected" ? "all" : scope;

  async function handleExport() {
    setSubmitting(true);
    setError(null);

    try {
      const params = new URLSearchParams({ format, scope: effectiveScope });
      if (effectiveScope === "selected") {
        selectedIds.forEach((id) => params.append("id", id));
      }

      const response = await fetch(`/api/monitors/export?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "Unable to export monitors.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getDownloadFilename(response, effectiveScope, format);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      onOpenChange(false);
      showToast(
        `${effectiveScope === "selected" ? selectedIds.length : "All"} monitor${selectedIds.length === 1 && effectiveScope === "selected" ? "" : "s"} exported.`,
        "success"
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to export monitors.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export monitors</DialogTitle>
          <DialogDescription>
            Download operational monitor data. Credentials, recipients, and notification templates are excluded.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="monitor-export-scope">Scope</Label>
            <Select
              value={effectiveScope}
              onValueChange={(value) => setScope(value as ExportScope)}
              disabled={submitting}
            >
              <SelectTrigger id="monitor-export-scope" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All workspace monitors</SelectItem>
                <SelectItem value="selected" disabled={selectedScopeUnavailable}>
                  Selected monitors ({selectedIds.length})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="monitor-export-format">Format</Label>
            <Select
              value={format}
              onValueChange={(value) => setFormat(value as MonitorExportFormat)}
              disabled={submitting}
            >
              <SelectTrigger id="monitor-export-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">Excel workbook (.xlsx)</SelectItem>
                <SelectItem value="csv">CSV (.csv)</SelectItem>
                <SelectItem value="json">JSON (.json)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleExport()} disabled={submitting}>
            {submitting ? "Exporting…" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getDownloadFilename(response: Response, scope: ExportScope, format: MonitorExportFormat) {
  const disposition = response.headers.get("Content-Disposition");
  const filename = disposition?.match(/filename="([^"]+)"/i)?.[1];
  return filename ?? `sentrovia-monitors-${scope}.${format}`;
}
