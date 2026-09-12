"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNavigating, startTransition] = useTransition();
  const busy = submitting || isNavigating;

  async function handleLogout() {
    if (busy) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        throw new Error(data?.message ?? "Unable to sign out right now.");
      }

      startTransition(() => {
        router.replace("/login");
        router.refresh();
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to sign out right now.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleLogout}
        disabled={busy}
        className={cn(
          "gap-2 border-border/80 bg-muted/20 text-foreground/80 hover:bg-muted/40 hover:text-foreground",
          className
        )}
      >
        {busy ? <LoaderCircle data-icon="inline-start" className="size-3.5 animate-spin" /> : <LogOut data-icon="inline-start" className="size-3.5" />}
        {busy ? "Signing out" : "Sign out"}
      </Button>
    </div>
  );
}
