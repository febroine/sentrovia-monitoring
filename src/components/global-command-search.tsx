"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Building2, FileChartColumn, Play, Search, Settings, UserRound, ScrollText } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { hasPermission, type UserRole } from "@/lib/auth/permissions";
import type { GlobalSearchResult, GlobalSearchResultType } from "@/lib/search/types";
import { showToast } from "@/lib/client-toast";

const resultIcons: Record<GlobalSearchResultType, typeof Activity> = {
  monitor: Activity,
  company: Building2,
  log: ScrollText,
  member: UserRound,
  setting: Settings,
};

export function GlobalCommandSearch({ open, onOpenChange, role }: { open: boolean; onOpenChange: (open: boolean) => void; role: UserRole }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkMode, setCheckMode] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const quickActions = useMemo(() => [
    hasPermission(role, "monitors.manage") ? { label: "Add monitor", icon: Activity, href: "/monitoring?create=1" } : null,
    hasPermission(role, "monitors.manage") ? { label: "Run check", icon: Play, onClick: () => { setCheckMode(true); inputRef.current?.focus(); } } : null,
    hasPermission(role, "reports.manage") ? { label: "Create report", icon: FileChartColumn, href: "/reports?mode=preview" } : null,
    hasPermission(role, "companies.manage") ? { label: "Add company", icon: Building2, href: "/companies?create=1" } : null,
  ].filter(Boolean) as Array<{ label: string; icon: typeof Activity; href?: string; onClick?: () => void }>, [role]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setError(null);
      setCheckMode(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { cache: "no-store", signal: controller.signal });
        const data = (await response.json()) as { results?: GlobalSearchResult[]; message?: string };
        if (!response.ok) throw new Error(data.message ?? "Unable to search.");
        setResults(data.results ?? []);
      } catch (caughtError) {
        if (!controller.signal.aborted) setError(caughtError instanceof Error ? caughtError.message : "Unable to search.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  function navigate(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  async function runCheck(result: GlobalSearchResult) {
    if (!result.monitorId || checkingId) return;
    setCheckingId(result.monitorId);
    try {
      const response = await fetch(`/api/monitors/${result.monitorId}/recheck`, { method: "POST" });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Unable to queue the check.");
      showToast(`Check queued for ${result.title}.`, "success");
      navigate(result.href);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : "Unable to queue the check.";
      setError(message);
      showToast(message, "error");
    } finally {
      setCheckingId(null);
    }
  }

  const visibleResults = checkMode ? results.filter((item) => item.type === "monitor") : results;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(80vh,42rem)] overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-5 pb-4 pt-5">
          <DialogTitle>{checkMode ? "Run a monitor check" : "Search Sentrovia"}</DialogTitle>
          <DialogDescription>{checkMode ? "Find a monitor, then queue an immediate check." : "Find monitors, companies, logs, members, and settings."}</DialogDescription>
        </DialogHeader>
        <div className="px-5 pt-4">
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={checkMode ? "Search monitors" : "Search workspace"} aria-label="Search workspace" className="pl-9" />
          </div>
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-5 pb-5 pt-4">
          {!checkMode && query.trim().length < 2 && quickActions.length > 0 ? (
            <section aria-labelledby="quick-actions-title">
              <h3 id="quick-actions-title" className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Quick actions</h3>
              <div className="grid gap-1 sm:grid-cols-2">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return <button key={action.label} type="button" onClick={() => action.href ? navigate(action.href) : action.onClick?.()} className="flex min-h-10 items-center gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon aria-hidden="true" className="size-4 text-muted-foreground" /><span>{action.label}</span></button>;
                })}
              </div>
            </section>
          ) : null}
          {checkMode ? <Button variant="ghost" size="sm" className="mb-2 px-0" onClick={() => setCheckMode(false)}>Back to all actions</Button> : null}
          <div aria-live="polite" className="sr-only">{loading ? "Searching" : `${visibleResults.length} results`}</div>
          {error ? <p role="alert" className="rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          {query.trim().length >= 2 && !error ? (
            <div className="divide-y">
              {loading ? <p className="py-6 text-center text-sm text-muted-foreground">Searching…</p> : null}
              {!loading && visibleResults.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">No matching {checkMode ? "monitors" : "results"}.</p> : null}
              {!loading && visibleResults.map((result) => {
                const Icon = resultIcons[result.type];
                return (
                  <div key={`${result.type}-${result.id}`} className="flex items-center gap-2 py-1">
                    <button type="button" onClick={() => checkMode ? void runCheck(result) : navigate(result.href)} className="flex min-w-0 flex-1 items-start gap-3 rounded-sm px-2 py-2 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0"><span className="block truncate text-sm font-medium">{result.title}</span><span className="block truncate text-xs text-muted-foreground">{result.description}</span></span>
                    </button>
                    {checkMode ? <span className="shrink-0 pr-2 text-xs text-muted-foreground">{checkingId === result.monitorId ? "Queuing…" : "Run"}</span> : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
