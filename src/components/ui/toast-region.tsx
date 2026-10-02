"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TOAST_EVENT, type ToastPayload, type ToastTone } from "@/lib/client-toast";
import { cn } from "@/lib/utils";

type ToastItem = Required<ToastPayload> & { id: number };

const TOAST_DURATION_MS = 4500;
const MAX_VISIBLE_TOASTS = 3;

export function ToastRegion() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    function handleToast(event: Event) {
      const detail = (event as CustomEvent<ToastPayload>).detail;
      if (!detail?.message) return;

      const id = nextId.current++;
      const toast: ToastItem = { id, message: detail.message, tone: detail.tone ?? "info" };
      setToasts((current) => [...current.slice(-(MAX_VISIBLE_TOASTS - 1)), toast]);
      window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), TOAST_DURATION_MS);
    }

    window.addEventListener(TOAST_EVENT, handleToast);
    return () => window.removeEventListener(TOAST_EVENT, handleToast);
  }, []);

  // The region stays mounted, so screen readers already watch it when the first toast arrives.
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((toast) => (
        <Toast key={toast.id} item={toast} onClose={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} />
      ))}
    </div>
  );
}

function Toast({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      // An opaque surface with a tinted edge: a translucent tint let the page show through the text.
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-md border border-border bg-popover px-3 py-3 text-popover-foreground shadow-lg",
        item.tone === "success" && "border-l-4 border-l-emerald-500",
        item.tone === "error" && "border-l-4 border-l-destructive",
        item.tone === "info" && "border-l-4 border-l-sky-500"
      )}
    >
      <ToastIcon tone={item.tone} />
      <p className="min-w-0 flex-1 text-sm leading-5">{item.message}</p>
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClose} aria-label="Dismiss notification">
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ToastIcon({ tone }: { tone: ToastTone }) {
  const className = cn("mt-0.5 h-4 w-4 shrink-0", getToastIconClass(tone));
  if (tone === "success") return <CheckCircle2 className={className} />;
  if (tone === "error") return <AlertCircle className={className} />;
  return <Info className={className} />;
}

function getToastIconClass(tone: ToastTone) {
  if (tone === "success") return "text-emerald-500";
  if (tone === "error") return "text-destructive";
  return "text-sky-500";
}
