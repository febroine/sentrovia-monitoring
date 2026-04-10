"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [isNavigating, startTransition] = useTransition();
  const busy = submitting || isNavigating;

  async function handleLogout() {
    if (busy) {
      return;
    }

    setSubmitting(true);

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setSubmitting(false);
      startTransition(() => {
        router.replace("/login");
        router.refresh();
      });
    }
  }

  return (
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
      {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
      {busy ? "Signing out" : "Sign out"}
    </Button>
  );
}
