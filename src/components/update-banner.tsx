"use client";

import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

type UpdateResponse = {
  enabled: boolean;
  repo: string | null;
  branch: string;
  currentVersion: string;
  remoteVersion: string | null;
  updateAvailable: boolean;
  canAutoApply: boolean;
  message: string;
  releaseUrl: string | null;
};

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export function UpdateBanner() {
  const [status, setStatus] = useState<UpdateResponse | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const load = async () => {
      const response = await fetch("/api/app-update", { cache: "no-store" });
      const data = (await response.json()) as UpdateResponse;

      if (!cancelled) {
        setStatus(data);
      }
    };

    void load();
    timer = setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, []);

  if (!status?.enabled || !status.updateAvailable || status.remoteVersion === dismissedVersion) {
    return null;
  }

  async function handleApplyUpdate() {
    setSubmitting(true);
    setActionMessage(null);

    try {
      const response = await fetch("/api/app-update", { method: "POST" });
      const data = (await response.json()) as { message?: string };
      setActionMessage(data.message ?? "Update request completed.");
    } catch {
      setActionMessage("Update request could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed right-5 top-5 z-[60] w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-emerald-500/20 bg-card/95 p-4 shadow-[0_24px_50px_rgba(0,0,0,0.24)] backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-500">
          <Download className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-tight">A new Sentrovia version is available</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {status.currentVersion} → {status.remoteVersion}
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{actionMessage ?? status.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void handleApplyUpdate()} disabled={submitting || !status.canAutoApply}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              {submitting ? "Updating..." : "Update"}
            </Button>
            {status.releaseUrl ? (
              <a
                href={status.releaseUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                View source
              </a>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setDismissedVersion(status.remoteVersion)}>
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
