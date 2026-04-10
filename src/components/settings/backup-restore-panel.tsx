"use client";

import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

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

  async function handleExport() {
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
  }

  async function handleRestore() {
    setRestoring(true);
    setMessage(null);

    const response = await fetch("/api/system/backup/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, content }),
    });
    const data = (await response.json()) as { message?: string };

    setRestoring(false);
    setMessage(response.ok ? "Workspace backup restored. Refreshing the page is recommended." : data.message ?? "Unable to restore the backup.");
  }

  return (
    <Card>
      <CardHeader className="border-b bg-muted/20 pb-4">
        <CardTitle className="text-base">Backup and Restore</CardTitle>
        <CardDescription>Export the full workspace or paste a backup bundle to restore monitors, companies, and settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40 space-y-2">
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
          <Button variant="outline" onClick={() => void handleExport()}>
            <Download data-icon="inline-start" />
            Export backup
          </Button>
          <div className="text-xs text-muted-foreground">
            Last backup: {lastBackupAt ? new Date(lastBackupAt).toLocaleString() : "Not recorded yet"}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Restore bundle</Label>
          <Textarea
            rows={10}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Paste a Sentrovia workspace backup in JSON or YAML format."
            className="font-mono text-xs"
          />
        </div>

        {message ? <div className="rounded-lg border px-3 py-2 text-sm">{message}</div> : null}

        <Button onClick={() => void handleRestore()} disabled={restoring || !content.trim()}>
          <Upload data-icon="inline-start" />
          {restoring ? "Restoring..." : "Restore backup"}
        </Button>
      </CardContent>
    </Card>
  );
}
