"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const STATUS_PAGE_REFRESH_INTERVAL_MS = 10_000;

export function StatusPageRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };
    const interval = window.setInterval(refresh, STATUS_PAGE_REFRESH_INTERVAL_MS);

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        refresh();
      }
    }
  }, [router]);

  return null;
}
