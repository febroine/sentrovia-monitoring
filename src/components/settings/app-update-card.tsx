"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Download, RefreshCw, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { SettingsPayload } from "@/lib/settings/types";

type UpdateStatus = {
  enabled: boolean;
  repo: string | null;
  branch: string;
  currentVersion: string;
  remoteVersion: string | null;
  updateAvailable: boolean;
  canAutoApply: boolean;
  message: string;
  releaseUrl: string | null;
  checkedAt: string;
};

export function AppUpdateCard({
  settings,
  updateSetting,
}: {
  settings: SettingsPayload;
  updateSetting: (path: string, value: string | number | boolean | string[]) => void;
}) {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void refreshStatus();
  }, []);

  async function refreshStatus() {
    setLoading(true);

    try {
      const response = await fetch("/api/app-update", { cache: "no-store" });
      const data = (await response.json()) as UpdateStatus & { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to load update status.");
      }

      setStatus(data);
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load update status.");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  async function applyUpdate() {
    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/app-update", { method: "POST" });
      const data = (await response.json()) as { message?: string };
      setMessage(data.message ?? "Update request completed.");
      await refreshStatus();
    } catch {
      setMessage("Update request could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl border border-border/70 bg-background/80 p-2.5 shadow-sm">
            <Rocket className="h-4 w-4 text-sky-600 dark:text-sky-300" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-base">App Updates</CardTitle>
            <CardDescription>Check GitHub version status instantly and see why an update banner does or does not appear.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-6">
        {message ? (
          <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-sm">{message}</div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Current" value={status?.currentVersion ?? "--"} />
          <Metric label="Remote" value={status?.remoteVersion ?? "--"} />
          <Metric label="Repo" value={status?.repo ?? "Not configured"} />
          <Metric
            label="Last Checked"
            value={status?.checkedAt ? new Date(status.checkedAt).toLocaleString() : loading ? "Checking..." : "--"}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Update Repository">
            <Input
              value={settings.appUpdates.repo}
              onChange={(event) => updateSetting("appUpdates.repo", event.target.value)}
              placeholder="owner/repository"
            />
          </Field>
          <Field label="Update Branch">
            <Input
              value={settings.appUpdates.branch}
              onChange={(event) => updateSetting("appUpdates.branch", event.target.value)}
              placeholder="main"
            />
          </Field>
          <div className="rounded-xl border bg-muted/10 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Allow In-Place Update</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  If disabled, the app can still detect new versions but will not auto-pull.
                </p>
              </div>
              <Switch
                checked={settings.appUpdates.enableInPlaceUpdates}
                onCheckedChange={(checked) => updateSetting("appUpdates.enableInPlaceUpdates", checked)}
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-muted/15 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {loading
                  ? "Checking update status..."
                  : status?.updateAvailable
                    ? "A newer version is available."
                    : "This instance is already on the latest detected version."}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                {status?.message ?? "The update service has not returned status yet."}
              </p>
              <div className="grid gap-1 text-xs text-muted-foreground">
                <span>Enabled: {status ? (status.enabled ? "Yes" : "No") : "--"}</span>
                <span>Branch: {status?.branch ?? "--"}</span>
                <span>Auto Apply: {status ? (status.canAutoApply ? "Yes" : "No") : "--"}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void refreshStatus()} disabled={loading || submitting}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Check Now
              </Button>
              <Button onClick={() => void applyUpdate()} disabled={submitting || !status?.canAutoApply}>
                <Download className="mr-2 h-4 w-4" />
                {submitting ? "Updating..." : "Apply Update"}
              </Button>
              {status?.releaseUrl ? (
                <a
                  href={status.releaseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <ArrowUpRight className="mr-2 h-4 w-4" />
                  View Source
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/10 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 break-words text-sm font-medium">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
