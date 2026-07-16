"use client";

import { useState } from "react";
import { AlertTriangle, Download, ScanSearch, Upload, Vault } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WORKSPACE_BACKUP_IMPORT_LIMITS } from "@/lib/import-limits";

export function BackupRestorePanel({
  lastBackupAt,
  onBackupCreated,
}: {
  lastBackupAt: string | null;
  onBackupCreated: (value: string) => void;
}) {
  const [format, setFormat] = useState<"json" | "yaml">("json");
  const [content, setContent] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [restoreToken, setRestoreToken] = useState<string | null>(null);

  async function handleExport() {
    try {
      const response = await fetch(`/api/system/backup/export?format=${format}`, { cache: "no-store" });
      const text = await response.text();

      if (!response.ok) {
        setMessage("Unable to create a workspace backup.");
        return;
      }

      const blob = new Blob([text], { type: format === "yaml" ? "application/yaml" : "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sentrovia-workspace-backup.${format}`;
      link.click();
      URL.revokeObjectURL(url);
      const timestamp = new Date().toISOString();
      onBackupCreated(timestamp);
      setMessage("Workspace backup exported.");
    } catch {
      setMessage("Unable to create a workspace backup.");
    }
  }

  async function handleRestore(mode: "preview" | "restore") {
    setRestoring(true);
    setMessage(null);

    try {
      const response = await fetch("/api/system/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          content,
          mode,
          confirm: mode === "restore",
          restoreToken: mode === "restore" ? restoreToken : undefined,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        message?: string;
        preview?: RestorePreview;
        restoreToken?: string;
      } | null;

      if (!response.ok) {
        setMessage(data?.message ?? "Unable to restore the backup.");
        if (mode === "restore" && response.status === 400) {
          setPreview(null);
          setRestoreToken(null);
        }
      } else if (mode === "preview") {
        const nextPreview = data?.preview && data.restoreToken ? data.preview : null;
        setPreview(nextPreview);
        setRestoreToken(data?.restoreToken ?? null);
        setMessage(nextPreview ? "Restore analysis is ready. Review the impact before continuing." : "Unable to verify the restore analysis.");
      } else {
        setPreview(null);
        setRestoreToken(null);
        setContent("");
        setMessage("Workspace backup restored. Refreshing the page is recommended.");
      }
    } catch {
      setMessage("Unable to restore the backup.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b bg-muted/20 px-6 py-5">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl border border-border/70 bg-background/80 p-2.5 shadow-sm">
            <Vault className="h-4 w-4 text-amber-600 dark:text-amber-300" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-base">Backup and Restore</CardTitle>
            <CardDescription>
              Export workspace configuration or paste a backup bundle to restore monitors, companies, and settings.
              Secrets are not exported. Existing matching PostgreSQL and SMTP credentials are preserved when
              restoring this workspace; a fresh deployment requires those credentials to be entered again.
              Telegram delivery is disabled in the exported bundle.
              Restore accepts up to {WORKSPACE_BACKUP_IMPORT_LIMITS.maxBytesLabel},{" "}
              {WORKSPACE_BACKUP_IMPORT_LIMITS.maxCompanies} companies, and{" "}
              {WORKSPACE_BACKUP_IMPORT_LIMITS.maxMonitors} monitors.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-6 md:p-7">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-4 md:flex-row md:items-end">
            <div className="w-40 space-y-2">
              <Label>Format</Label>
              <Select value={format} onValueChange={(value) => {
                setFormat(value as "json" | "yaml");
                setPreview(null);
                setRestoreToken(null);
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="yaml">YAML</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => void handleExport()}>
              <Download data-icon="inline-start" />
              Export backup
            </Button>
          </div>
          <div className="text-xs text-muted-foreground md:text-right">
            Last backup: {lastBackupAt ? new Date(lastBackupAt).toLocaleString() : "Not recorded yet"}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Restore bundle</Label>
          <p className="text-xs text-muted-foreground">
            Limit: {WORKSPACE_BACKUP_IMPORT_LIMITS.maxBytesLabel},{" "}
            {WORKSPACE_BACKUP_IMPORT_LIMITS.maxCompanies} companies,{" "}
            {WORKSPACE_BACKUP_IMPORT_LIMITS.maxMonitors} monitors.
          </p>
          <Textarea
            rows={10}
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setPreview(null);
              setRestoreToken(null);
            }}
            placeholder="Paste a Sentrovia workspace backup in JSON or YAML format."
            className="font-mono text-xs"
          />
        </div>

        {message ? <div className="rounded-lg border px-3 py-2 text-sm">{message}</div> : null}

        {preview ? <RestoreImpactPreview preview={preview} /> : null}

        <Button onClick={() => void handleRestore(preview ? "restore" : "preview")} disabled={restoring || !content.trim() || Boolean(preview && !restoreToken)}>
          {preview ? <Upload data-icon="inline-start" /> : <ScanSearch data-icon="inline-start" />}
          {restoring ? (preview ? "Restoring..." : "Analyzing...") : (preview ? "Confirm and restore" : "Analyze backup")}
        </Button>
      </CardContent>
    </Card>
  );
}

type RestorePreview = {
  current: { companies: number; monitors: number };
  incoming: { companies: number; monitors: number };
  settingsWillBeReplaced: boolean;
  operationalHistoryWillBeDeleted: boolean;
  removedCompanies: string[];
  removedMonitors: string[];
  reportSchedules: { remapped: number; disabled: number };
};

function RestoreImpactPreview({ preview }: { preview: RestorePreview }) {
  return (
    <div className="space-y-3 rounded-lg border border-amber-300/70 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-medium">Restore impact</p>
          <p className="text-xs text-muted-foreground">This operation replaces workspace settings and removes existing check, event, and outage history.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <ImpactCount label="Current companies" value={preview.current.companies} />
        <ImpactCount label="Incoming companies" value={preview.incoming.companies} />
        <ImpactCount label="Current monitors" value={preview.current.monitors} />
        <ImpactCount label="Incoming monitors" value={preview.incoming.monitors} />
      </div>
      {(preview.removedCompanies.length > 0 || preview.removedMonitors.length > 0) ? (
        <p className="text-xs text-muted-foreground">
          Removed by restore: {preview.removedCompanies.length} companies and {preview.removedMonitors.length} monitors.
        </p>
      ) : null}
      {(preview.reportSchedules.remapped > 0 || preview.reportSchedules.disabled > 0) ? (
        <p className="text-xs text-muted-foreground">
          Company reports: {preview.reportSchedules.remapped} schedules will be remapped and {preview.reportSchedules.disabled} will be disabled.
        </p>
      ) : null}
    </div>
  );
}

function ImpactCount({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md border bg-background px-3 py-2"><p className="font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>;
}
