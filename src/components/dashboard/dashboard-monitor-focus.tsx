"use client";

import { ExternalLink, Flag, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/lib/dashboard/service";

type DashboardMonitor = DashboardData["monitors"][number];

export function DashboardMonitorFocus({
  monitors,
  focus,
  pendingId,
  onFlag,
}: {
  monitors: DashboardData["monitors"];
  focus: "all" | "favorites" | "critical";
  pendingId: string | null;
  onFlag: (monitorId: string, field: "isFavorite" | "isCritical", value: boolean) => void;
}) {
  const title = focus === "favorites" ? "Favorite monitors" : focus === "critical" ? "Critical monitors" : "Monitor focus";
  const emptyMessage = focus === "favorites" ? "Mark monitors as favorites to build this view." : focus === "critical" ? "Mark monitors as critical to build this view." : "No active monitors in this scope.";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Prioritized by criticality, favorites, and outage state.</p>
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{monitors.length} monitors</span>
        </div>
      </CardHeader>
      <CardContent>
        {monitors.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="grid border-y md:grid-cols-2 md:divide-x">
            {monitors.map((monitor) => <MonitorFocusRow key={monitor.id} monitor={monitor} pending={pendingId === monitor.id} onFlag={onFlag} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MonitorFocusRow({
  monitor,
  pending,
  onFlag,
}: {
  monitor: DashboardMonitor;
  pending: boolean;
  onFlag: (monitorId: string, field: "isFavorite" | "isCritical", value: boolean) => void;
}) {
  const isDown = monitor.status === "down";
  const isPending = monitor.status === "pending";
  const statusLabel = isDown ? "Down" : isPending ? "Pending" : "Up";
  const statusClass = isDown ? "text-destructive" : isPending ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className={`px-3 py-3 ${isDown ? "bg-destructive/[0.04]" : ""}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${isDown ? "bg-destructive" : isPending ? "bg-amber-500" : "bg-emerald-500"}`} aria-label={statusLabel} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{monitor.name}</p>
              <a href={monitor.url} target="_blank" rel="noreferrer" className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground" title={monitor.url}>
                <span className="truncate">{monitor.url}</span><ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </div>
            <span className={`shrink-0 text-xs font-medium ${statusClass}`}>{statusLabel}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{monitor.company ?? "Unassigned"}{monitor.latencyMs !== null ? ` · ${monitor.latencyMs}ms` : ""}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" disabled={pending} onClick={() => onFlag(monitor.id, "isFavorite", !monitor.isFavorite)} aria-label={monitor.isFavorite ? `Remove ${monitor.name} from favorites` : `Add ${monitor.name} to favorites`} title={monitor.isFavorite ? "Remove favorite" : "Add favorite"}>
                <Star className={`h-4 w-4 ${monitor.isFavorite ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`} />
              </Button>
              <Button variant="ghost" size="icon-sm" disabled={pending} onClick={() => onFlag(monitor.id, "isCritical", !monitor.isCritical)} aria-label={monitor.isCritical ? `Remove critical flag from ${monitor.name}` : `Mark ${monitor.name} as critical`} title={monitor.isCritical ? "Remove critical flag" : "Mark critical"}>
                <Flag className={`h-4 w-4 ${monitor.isCritical ? "fill-rose-500 text-rose-500" : "text-muted-foreground"}`} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
