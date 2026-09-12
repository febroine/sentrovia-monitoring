import { CheckCircle2, CheckSquare, Clock, Flag, Globe, Mail, Play, Power, RadioTower, Send, Settings2, Square, Star, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getMonitorTargetDisplay, getMonitorTypeLabel } from "@/lib/monitors/targets";
import type { MonitorRecord, NotificationPref, SiteStatus } from "@/lib/monitors/types";
import { formatLastChecked, formatLatency } from "@/components/monitoring/utils";
import { isMonitorTemporarilyPaused } from "@/lib/monitors/pause";
import { formatPanelDateTime } from "@/lib/time";

function StatusBadge({
  status,
  code,
  isActive,
  pausedUntil,
  verificationMode,
  verificationFailureCount,
  threshold,
  slow,
}: {
  status: SiteStatus;
  code: number | null;
  isActive: boolean;
  pausedUntil: string | null;
  verificationMode: boolean;
  verificationFailureCount: number;
  threshold: number;
  slow: boolean;
}) {
  if (!isActive) {
    return <Badge variant="outline" className="text-muted-foreground">DISABLED</Badge>;
  }

  if (isMonitorTemporarilyPaused(pausedUntil)) {
    return <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400"><Clock className="size-3" />PAUSED</Badge>;
  }

  if (verificationMode) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400"
        aria-label={`Verifying monitor failure, attempt ${verificationFailureCount} of ${threshold}`}
      >
        <Clock className="size-3" />
        VERIFYING · {verificationFailureCount}/{threshold}
      </Badge>
    );
  }

  if (slow) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400"
        aria-label="Online, slow response"
      >
        <Clock className="size-3" />
        ONLINE · SLOW
      </Badge>
    );
  }

  if (status === "up") {
    return <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="size-3" />ONLINE</Badge>;
  }
  if (status === "down") {
    return <Badge variant="outline" className="gap-1 border-destructive/30 text-destructive"><XCircle className="size-3" />OFFLINE{code ? ` · ${code}` : ""}</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground">PENDING</Badge>;
}

function NotificationBadge({ pref }: { pref: NotificationPref }) {
  const label = pref === "both" ? "Email + Telegram" : pref === "none" ? "None" : pref === "email" ? "Email" : "Telegram";

  return (
    <div className="flex items-center gap-1 text-muted-foreground" title={label} aria-label={label}>
      {pref === "email" || pref === "both" ? <Mail className="size-3.5" /> : null}
      {pref === "telegram" || pref === "both" ? <Send className="size-3.5" /> : null}
      {pref === "none" ? <span className="text-[10px]">--</span> : null}
    </div>
  );
}

export function MonitorTable({
  monitors,
  readOnly = false,
  loading,
  selectedIds,
  activeTogglePendingId,
  pausePendingId,
  flagPendingId,
  allPageSelected,
  somePageSelected,
  onToggleAll,
  onToggleOne,
  onToggleActive,
  onPause,
  onResumePause,
  onToggleFlag,
  onEdit,
  onOpenTimeline,
  emptyState,
}: {
  monitors: MonitorRecord[];
  readOnly?: boolean;
  loading: boolean;
  selectedIds: Set<string>;
  activeTogglePendingId: string | null;
  pausePendingId: string | null;
  flagPendingId: string | null;
  allPageSelected: boolean;
  somePageSelected: boolean;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onToggleActive: (monitor: MonitorRecord) => void;
  onPause: (monitor: MonitorRecord) => void;
  onResumePause: (monitor: MonitorRecord) => void;
  onToggleFlag: (monitor: MonitorRecord, field: "isFavorite" | "isCritical" | "publishOnStatusPage") => void;
  onEdit: (monitor: MonitorRecord) => void;
  onOpenTimeline: (monitor: MonitorRecord) => void;
  emptyState?: { title: string; description?: string; action?: ReactNode };
}) {
  return (
    <>
      <div className="hidden min-w-0 max-w-full rounded-lg bg-card xl:block [&>[data-slot=table-container]]:overflow-x-hidden">
      <Table className="min-w-0 table-fixed text-xs">
        <colgroup>
          <col className="w-[3%]" />
          <col className="w-[16%]" />
          <col className="w-[18%]" />
          <col className="w-[14%]" />
          <col className="w-[7%]" />
          <col className="w-[5%]" />
          <col className="w-[10%]" />
          <col className="w-[10%]" />
          <col className="w-[17%]" />
        </colgroup>
        <TableHeader>
          <TableRow className="bg-surface-high hover:bg-surface-high">
            <TableHead className="px-1 pl-2">
              <button type="button" disabled={readOnly} onClick={onToggleAll} className="flex items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-30" aria-label={allPageSelected ? "Clear visible monitor selection" : "Select all visible monitors"}>
                {allPageSelected ? <CheckSquare className="size-4 text-primary" /> : somePageSelected ? <Square className="size-4 text-primary opacity-60" /> : <Square className="size-4" />}
              </button>
            </TableHead>
            <TableHead className="px-1.5">Monitor</TableHead>
            <TableHead className="px-1">Target</TableHead>
            <TableHead className="px-1">Health</TableHead>
            <TableHead className="px-1">State</TableHead>
            <TableHead className="px-1">Notify</TableHead>
            <TableHead className="px-1.5">Company</TableHead>
            <TableHead className="px-1">Observed</TableHead>
            <TableHead className="pr-2 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">Loading monitors…</TableCell>
            </TableRow>
          ) : monitors.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9}>
                <EmptyState
                  title={emptyState?.title ?? "No monitors in this view"}
                  description={emptyState?.description}
                  action={emptyState?.action}
                />
              </TableCell>
            </TableRow>
          ) : (
            monitors.map((monitor) => (
              <TableRow key={monitor.id} className={selectedIds.has(monitor.id) ? "bg-primary/5" : ""}>
                <TableCell className="px-1 pl-2">
                  <button type="button" disabled={readOnly} onClick={() => onToggleOne(monitor.id)} className="flex items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-30" aria-label={selectedIds.has(monitor.id) ? `Deselect ${monitor.name}` : `Select ${monitor.name}`}>
                    {selectedIds.has(monitor.id) ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
                  </button>
                </TableCell>
                <TableCell className="overflow-hidden px-1.5">
                  <div className="flex min-w-0 items-center gap-1.5" title={`${monitor.name} · ${getMonitorTypeLabel(monitor.monitorType)}`}>
                    <span className={`size-1.5 rounded-full ${monitor.status === "up" ? "bg-emerald-500" : monitor.status === "down" ? "bg-destructive" : "bg-muted-foreground"}`} />
                    <div className="min-w-0">
                      {readOnly ? (
                        <p className="truncate font-medium">{monitor.name}</p>
                      ) : (
                        <button type="button" className="block max-w-full truncate rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/40" onClick={() => onEdit(monitor)}>
                          {monitor.name}
                        </button>
                      )}
                      <p className="truncate text-[10px] text-muted-foreground">{getMonitorTypeLabel(monitor.monitorType)}</p>
                      <p className="truncate text-[10px] text-muted-foreground" title={monitor.tags.join(", ") || "No tags"}>
                        {monitor.tags.length > 0 ? monitor.tags.join(" · ") : "No tags"}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="overflow-hidden px-1.5">
                  <div className="flex min-w-0 items-center gap-1 text-muted-foreground" title={getMonitorTargetDisplay(monitor)}>
                    <Globe className="size-3 shrink-0" />
                    <span className="min-w-0 truncate font-mono">{getMonitorTargetDisplay(monitor)}</span>
                  </div>
                </TableCell>
                <TableCell className="overflow-hidden px-1">
                  <div className="min-w-0" title={getStatusDescription(monitor)}>
                    <StatusBadge
                      status={monitor.status}
                      code={monitor.statusCode}
                      isActive={monitor.isActive}
                      pausedUntil={monitor.pausedUntil}
                      verificationMode={monitor.verificationMode}
                      verificationFailureCount={monitor.verificationFailureCount}
                      threshold={Math.max(1, monitor.retries)}
                      slow={isSlowMonitor(monitor)}
                    />
                    <p className="mt-1 truncate text-[10px] tabular-nums text-muted-foreground" title={`HTTP ${monitor.statusCode ?? "--"} · ${formatLatency(monitor.latencyMs)}`}>
                      HTTP {monitor.statusCode ?? "--"} · {formatLatency(monitor.latencyMs)}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="px-1">
                  <div className="flex items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={readOnly || activeTogglePendingId === monitor.id}
                      aria-label={monitor.isActive ? `Disable ${monitor.name}` : `Enable ${monitor.name}`}
                      title={monitor.isActive ? "Disable monitor" : "Enable monitor"}
                      onClick={() => onToggleActive(monitor)}
                    >
                      <Power className={`size-3.5 ${monitor.isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} />
                    </Button>
                    {monitor.isActive ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        disabled={readOnly || pausePendingId === monitor.id}
                        aria-label={isMonitorTemporarilyPaused(monitor.pausedUntil) ? `Resume ${monitor.name} now` : `Temporarily pause ${monitor.name}`}
                        title={isMonitorTemporarilyPaused(monitor.pausedUntil) ? "Resume monitoring now" : "Pause for a duration"}
                        onClick={() => isMonitorTemporarilyPaused(monitor.pausedUntil) ? onResumePause(monitor) : onPause(monitor)}
                      >
                        {isMonitorTemporarilyPaused(monitor.pausedUntil) ? <Play className="size-3.5 text-emerald-600 dark:text-emerald-400" /> : <Clock className="size-3.5 text-muted-foreground" />}
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="px-1.5"><NotificationBadge pref={monitor.notificationPref} /></TableCell>
                <TableCell className="overflow-hidden px-1.5"><span className="block truncate" title={monitor.company ?? undefined}>{monitor.company ?? "--"}</span></TableCell>
                <TableCell className="overflow-hidden px-1.5 tabular-nums">
                  <span className="block truncate text-muted-foreground" title={formatLastChecked(monitor.lastCheckedAt)}>{formatLastChecked(monitor.lastCheckedAt)}</span>
                  <span className="mt-1 block truncate text-[10px] text-muted-foreground" title={`${monitor.uptime} uptime`}>{monitor.uptime} uptime</span>
                </TableCell>
                <TableCell className="px-1 pr-2">
                  <div className="flex items-center justify-end gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-1.5"
                      aria-label={`View timeline for ${monitor.name}`}
                      title="View timeline"
                      onClick={() => onOpenTimeline(monitor)}
                    >
                      <Clock className="size-3.5 text-muted-foreground" />
                      <span className="text-[10px]">Timeline</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={readOnly || flagPendingId === monitor.id}
                      aria-label={monitor.publishOnStatusPage ? `Remove ${monitor.name} from public status pages` : `Publish ${monitor.name} on public status pages`}
                      title={monitor.publishOnStatusPage ? "Remove from public status" : "Publish on public status"}
                      onClick={() => onToggleFlag(monitor, "publishOnStatusPage")}
                    >
                      <RadioTower className={`size-3.5 ${monitor.publishOnStatusPage ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={readOnly || flagPendingId === monitor.id}
                      aria-label={monitor.isFavorite ? `Remove ${monitor.name} from favorites` : `Add ${monitor.name} to favorites`}
                      title={monitor.isFavorite ? "Remove favorite" : "Add favorite"}
                      onClick={() => onToggleFlag(monitor, "isFavorite")}
                    >
                      <Star className={`size-3.5 ${monitor.isFavorite ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={readOnly || flagPendingId === monitor.id}
                      aria-label={monitor.isCritical ? `Remove critical flag from ${monitor.name}` : `Mark ${monitor.name} as critical`}
                      title={monitor.isCritical ? "Remove critical flag" : "Mark critical"}
                      onClick={() => onToggleFlag(monitor, "isCritical")}
                    >
                      <Flag className={`size-3.5 ${monitor.isCritical ? "fill-rose-500 text-rose-500" : "text-muted-foreground"}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={readOnly}
                      aria-label={`Edit ${monitor.name}`}
                      title="Edit monitor"
                      onClick={() => onEdit(monitor)}
                    >
                      <Settings2 className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      </div>
      <MobileMonitorList
      monitors={monitors}
      readOnly={readOnly}
      loading={loading}
      selectedIds={selectedIds}
      activeTogglePendingId={activeTogglePendingId}
      pausePendingId={pausePendingId}
      flagPendingId={flagPendingId}
      allPageSelected={allPageSelected}
      somePageSelected={somePageSelected}
      onToggleAll={onToggleAll}
      onToggleOne={onToggleOne}
      onToggleActive={onToggleActive}
      onPause={onPause}
      onResumePause={onResumePause}
      onToggleFlag={onToggleFlag}
      onEdit={onEdit}
      onOpenTimeline={onOpenTimeline}
      emptyState={emptyState}
      />
    </>
  );
}

function MobileMonitorList({
  monitors,
  readOnly,
  loading,
  selectedIds,
  activeTogglePendingId,
  pausePendingId,
  flagPendingId,
  allPageSelected,
  somePageSelected,
  onToggleAll,
  onToggleOne,
  onToggleActive,
  onPause,
  onResumePause,
  onToggleFlag,
  onEdit,
  onOpenTimeline,
  emptyState,
}: {
  monitors: MonitorRecord[];
  readOnly: boolean;
  loading: boolean;
  selectedIds: Set<string>;
  activeTogglePendingId: string | null;
  pausePendingId: string | null;
  flagPendingId: string | null;
  allPageSelected: boolean;
  somePageSelected: boolean;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onToggleActive: (monitor: MonitorRecord) => void;
  onPause: (monitor: MonitorRecord) => void;
  onResumePause: (monitor: MonitorRecord) => void;
  onToggleFlag: (monitor: MonitorRecord, field: "isFavorite" | "isCritical" | "publishOnStatusPage") => void;
  onEdit: (monitor: MonitorRecord) => void;
  onOpenTimeline: (monitor: MonitorRecord) => void;
  emptyState?: { title: string; description?: string; action?: ReactNode };
}) {
  if (loading) {
    return <div className="rounded-md bg-muted/25 px-4 py-8 text-center text-sm text-muted-foreground xl:hidden">Loading monitors…</div>;
  }

  if (monitors.length === 0) {
    return (
      <div className="xl:hidden">
        <EmptyState
          title={emptyState?.title ?? "No monitors in this view"}
          description={emptyState?.description}
          action={emptyState?.action}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 xl:hidden">
      <div className="flex items-center justify-between rounded-md bg-muted/20 px-3 py-2">
        <button type="button" disabled={readOnly} onClick={onToggleAll} className="inline-flex min-h-11 items-center gap-2 rounded-sm text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-30">
          {allPageSelected ? <CheckSquare className="size-4 text-primary" /> : somePageSelected ? <Square className="size-4 text-primary opacity-60" /> : <Square className="size-4" />}
          Select page
        </button>
        <span className="text-xs text-muted-foreground">{readOnly ? "Read-only access" : "Use Edit to change a monitor"}</span>
      </div>
      {monitors.map((monitor) => (
        <MobileMonitorCard
          key={monitor.id}
          monitor={monitor}
          readOnly={readOnly}
          selected={selectedIds.has(monitor.id)}
          activePending={activeTogglePendingId === monitor.id}
          pausePending={pausePendingId === monitor.id}
          flagPending={flagPendingId === monitor.id}
          onToggleOne={onToggleOne}
          onToggleActive={onToggleActive}
          onPause={onPause}
          onResumePause={onResumePause}
          onToggleFlag={onToggleFlag}
          onEdit={onEdit}
          onOpenTimeline={onOpenTimeline}
        />
      ))}
    </div>
  );
}

function MobileMonitorCard({
  monitor,
  readOnly,
  selected,
  activePending,
  pausePending,
  flagPending,
  onToggleOne,
  onToggleActive,
  onPause,
  onResumePause,
  onToggleFlag,
  onEdit,
  onOpenTimeline,
}: {
  monitor: MonitorRecord;
  readOnly: boolean;
  selected: boolean;
  activePending: boolean;
  pausePending: boolean;
  flagPending: boolean;
  onToggleOne: (id: string) => void;
  onToggleActive: (monitor: MonitorRecord) => void;
  onPause: (monitor: MonitorRecord) => void;
  onResumePause: (monitor: MonitorRecord) => void;
  onToggleFlag: (monitor: MonitorRecord, field: "isFavorite" | "isCritical" | "publishOnStatusPage") => void;
  onEdit: (monitor: MonitorRecord) => void;
  onOpenTimeline: (monitor: MonitorRecord) => void;
}) {
  return (
    <div
      className={`rounded-lg p-4 ${selected ? "bg-primary/10" : "bg-card"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{monitor.name}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{getMonitorTypeLabel(monitor.monitorType)}</p>
        </div>
        <div>
          <StatusBadge
            status={monitor.status}
            code={monitor.statusCode}
            isActive={monitor.isActive}
            pausedUntil={monitor.pausedUntil}
            verificationMode={monitor.verificationMode}
            verificationFailureCount={monitor.verificationFailureCount}
            threshold={Math.max(1, monitor.retries)}
            slow={isSlowMonitor(monitor)}
          />
        </div>
      </div>
      <p className="mt-3 break-all text-xs text-muted-foreground">{getMonitorTargetDisplay(monitor)}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-md bg-muted/25 p-3 text-xs">
        <MobileMetric label="HTTP" value={monitor.statusCode ? String(monitor.statusCode) : "--"} />
        <MobileMetric label="Latency" value={formatLatency(monitor.latencyMs)} />
        <MobileMetric label="Uptime" value={monitor.uptime} />
      </div>
      <div className="mt-3">
        <Button variant="outline" size="sm" onClick={() => onOpenTimeline(monitor)}>
          View timeline
        </Button>
      </div>
      {!readOnly ? <div className="mt-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => onToggleOne(monitor.id)} aria-label={selected ? `Deselect ${monitor.name}` : `Select ${monitor.name}`} className="inline-flex min-h-11 items-center gap-2 rounded-sm text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
          {selected ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
          Select
        </button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-10 w-10 p-0" disabled={activePending} aria-label={monitor.isActive ? `Disable ${monitor.name}` : `Enable ${monitor.name}`} onClick={() => onToggleActive(monitor)}>
            <Power className={`size-4 ${monitor.isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} />
          </Button>
          {monitor.isActive ? (
            <Button variant="ghost" size="sm" className="h-10 w-10 p-0" disabled={pausePending} aria-label={isMonitorTemporarilyPaused(monitor.pausedUntil) ? `Resume ${monitor.name} now` : `Temporarily pause ${monitor.name}`} onClick={() => isMonitorTemporarilyPaused(monitor.pausedUntil) ? onResumePause(monitor) : onPause(monitor)}>
              {isMonitorTemporarilyPaused(monitor.pausedUntil) ? <Play className="size-4 text-emerald-600 dark:text-emerald-400" /> : <Clock className="size-4 text-muted-foreground" />}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" className="h-10 w-10 p-0" disabled={flagPending} aria-label={monitor.publishOnStatusPage ? `Remove ${monitor.name} from public status pages` : `Publish ${monitor.name} on public status pages`} onClick={() => onToggleFlag(monitor, "publishOnStatusPage")}>
            <RadioTower className={`size-4 ${monitor.publishOnStatusPage ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground"}`} />
          </Button>
          <Button variant="ghost" size="sm" className="h-10 w-10 p-0" disabled={flagPending} aria-label={monitor.isFavorite ? `Remove ${monitor.name} from favorites` : `Add ${monitor.name} to favorites`} onClick={() => onToggleFlag(monitor, "isFavorite")}>
            <Star className={`size-4 ${monitor.isFavorite ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`} />
          </Button>
          <Button variant="ghost" size="sm" className="h-10 w-10 p-0" disabled={flagPending} aria-label={monitor.isCritical ? `Remove critical flag from ${monitor.name}` : `Mark ${monitor.name} as critical`} onClick={() => onToggleFlag(monitor, "isCritical")}>
            <Flag className={`size-4 ${monitor.isCritical ? "fill-rose-500 text-rose-500" : "text-muted-foreground"}`} />
          </Button>
          <Button variant="outline" size="sm" className="h-10 px-3" onClick={() => onEdit(monitor)}>
            Edit
          </Button>
        </div>
      </div> : null}
    </div>
  );
}

function MobileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function isSlowMonitor(monitor: MonitorRecord) {
  return (
    monitor.status === "up" &&
    typeof monitor.latencyMs === "number" &&
    typeof monitor.slowResponseThresholdMs === "number" &&
    monitor.latencyMs > monitor.slowResponseThresholdMs
  );
}

function getStatusDescription(monitor: MonitorRecord) {
  if (!monitor.isActive) return "Disabled";
  if (isMonitorTemporarilyPaused(monitor.pausedUntil)) return `Paused until ${formatPauseUntil(monitor.pausedUntil!)}`;
  if (monitor.verificationMode) return `Verification pending · ${monitor.verificationFailureCount}/${Math.max(1, monitor.retries)}`;
  if (isSlowMonitor(monitor)) return "Online but above the configured latency threshold";
  if (monitor.status === "up") return "Online";
  if (monitor.status === "down") return monitor.statusCode ? `Offline · HTTP ${monitor.statusCode}` : "Offline";
  return "Pending first check";
}

function formatPauseUntil(value: string) {
  return formatPanelDateTime(value, { dateStyle: "medium", timeStyle: "short" });
}
