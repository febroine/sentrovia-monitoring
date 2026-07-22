"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATUS_PAGE_REFRESH_INTERVAL_MS = 10_000;
const STATUS_PAGE_REFRESH_INTERVAL_SECONDS = STATUS_PAGE_REFRESH_INTERVAL_MS / 1000;

export function StatusPageRefresh() {
  const router = useRouter();
  const [secondsRemaining, setSecondsRemaining] = useState(STATUS_PAGE_REFRESH_INTERVAL_SECONDS);
  const [isPending, startTransition] = useTransition();
  const refresh = useCallback(() => {
    if (document.visibilityState !== "visible") {
      return;
    }

    setSecondsRemaining(STATUS_PAGE_REFRESH_INTERVAL_SECONDS);
    startTransition(() => router.refresh());
  }, [router]);

  useEffect(() => {
    const refreshInterval = window.setInterval(refresh, STATUS_PAGE_REFRESH_INTERVAL_MS);
    const countdownInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setSecondsRemaining((current) => Math.max(0, current - 1));
      }
    }, 1000);

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(refreshInterval);
      window.clearInterval(countdownInterval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }
  }, [refresh]);

  return (
    <Button
      aria-label="Refresh status now"
      className="h-8 gap-2 px-2.5 text-muted-foreground"
      disabled={isPending}
      onClick={refresh}
      size="sm"
      title="Refresh status now"
      variant="ghost"
    >
      <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
      <span>{isPending ? "Refreshing" : `Refresh in ${secondsRemaining}s`}</span>
    </Button>
  );
}
