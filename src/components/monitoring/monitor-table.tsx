import { CheckCircle2, CheckSquare, Clock, Flag, Globe, Mail, Power, SearchX, Send, Settings2, Square, Star, XCircle } from "lucide-react";
import type { KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonitorHistoryStrip } from "@/components/monitoring/monitor-history-strip";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getMonitorTargetDisplay, getMonitorTypeLabel } from "@/lib/monitors/targets";
import type { MonitorHistoryPoint, MonitorRecord, NotificationPref, SiteStatus } from "@/lib/monitors/types";
import { formatLastChecked } from "@/components/monitoring/utils";

function StatusBadge({
  status,
  code,
  isActive,
  verificationMode,
  verificationFailureCount,
  threshold,
  slow,
}: {
  status: SiteStatus;
  code: number | null;
  isActive: boolean;
  verificationMode: boolean;
  verificationFailureCount: number;
  threshold: number;
  slow: boolean;
}) {
  if (!isActive) {
    return <Badge variant="outline" className="text-muted-foreground">PAUSED</Badge>;
  }

  if (verificationMode) {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400">
        <Clock className="size-3" />
        VERIFYING · {verificationFailureCount}/{threshold}
      </Badge>
    );
  }

  if (slow) {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400">
        <Clock className="size-3" />
        SLOW
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
  loading,
  historyByMonitor,
  selectedIds,
  activeTogglePendingId,
  flagPendingId,
  allPageSelected,
  somePageSelected,
  onToggleAll,
  onToggleOne,
  onToggleActive,
  onToggleFlag,
  onEdit,
  onSelectTimelinePoint,
}: {
  monitors: MonitorRecord[];
  loading: boolean;
  historyByMonitor: Record<string, MonitorHistoryPoint[]>;
  selectedIds: Set<string>;
  activeTogglePendingId: string | null;
  flagPendingId: string | null;
  allPageSelected: boolean;
  somePageSelected: boolean;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onToggleActive: (monitor: MonitorRecord) => void;
  onToggleFlag: (monitor: MonitorRecord, field: "isFavorite" | "isCritical") => void;
  onEdit: (monitor: MonitorRecord) => void;
  onSelectTimelinePoint: (monitor: MonitorRecord, point: MonitorHistoryPoint) => void;
}) {
  return (
    <>
      <div className="hidden min-w-0 max-w-full overflow-hidden rounded-lg border border-border md:block">
      <Table className="min-w-0 table-fixed text-[11px] xl:text-xs [&_th]:overflow-hidden [&_th]:text-ellipsis">
        <colgroup>
          <col className="w-[3%]" />
          <col className="w-[11%]" />
          <col className="w-[16%]" />
          <col className="w-[7%]" />
          <col className="w-[10%]" />
          <col className="w-[4%]" />
          <col className="w-[4%]" />
          <col className="w-[5%]" />
          <col className="w-[5%]" />
          <col className="w-[5%]" />
          <col className="w-[7%]" />
          <col className="w-[7%]" />
          <col className="w-[4%]" />
          <col className="w-[12%]" />
        </colgroup>
        <TableHeader>
          <TableRow className="bg-surface-high hover:bg-surface-high">
            <TableHead className="px-1 pl-2">
              <button type="button" onClick={onToggleAll} className="flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Select all">
                {allPageSelected ? <CheckSquare className="size-4 text-primary" /> : somePageSelected ? <Square className="size-4 text-primary opacity-60" /> : <Square className="size-4" />}
              </button>
            </TableHead>
            <TableHead className="px-1.5">Name</TableHead>
            <TableHead className="px-1">Target</TableHead>
            <TableHead className="px-1">Tags</TableHead>
            <TableHead className="px-1">Status</TableHead>
            <TableHead className="px-1">Active</TableHead>
            <TableHead className="px-1">HTTP</TableHead>
            <TableHead className="px-1">Latency</TableHead>
            <TableHead className="px-1">Notify</TableHead>
            <TableHead className="px-1" title="Company">Co.</TableHead>
            <TableHead className="px-1">Timeline</TableHead>
            <TableHead className="px-1">Last check</TableHead>
            <TableHead className="px-1">Uptime</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={14} className="py-12 text-center text-sm text-muted-foreground">Loading monitors...</TableCell>
            </TableRow>
          ) : monitors.length === 0 ? (
            <TableRow>
              <TableCell colSpan={14}>
                <EmptyState
                  icon={SearchX}
                  title="No monitors found"
                  description="Adjust the filters or add a monitor to start collecting uptime checks."
                />
              </TableCell>
            </TableRow>
          ) : (
            monitors.map((monitor) => (
              <TableRow key={monitor.id} className={selectedIds.has(monitor.id) ? "bg-primary/5" : ""} onClick={() => onEdit(monitor)}>
                <TableCell className="px-1 pl-2" onClick={(event) => event.stopPropagation()}>
                  <button type="button" onClick={(event) => { event.stopPropagation(); onToggleOne(monitor.id); }} className="flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Select row">
                    {selectedIds.has(monitor.id) ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
                  </button>
                </TableCell>
                <TableCell className="overflow-hidden px-1.5">
                  <div className="flex min-w-0 items-center gap-1.5" title={`${monitor.name} · ${getMonitorTypeLabel(monitor.monitorType)}`}>
                    <span className={`size-1.5 rounded-full ${monitor.status === "up" ? "bg-emerald-500" : monitor.status === "down" ? "bg-destructive" : "bg-muted-foreground"}`} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{monitor.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {getMonitorTypeLabel(monitor.monitorType)}
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
                <TableCell className="overflow-hidden px-1.5">
                  {monitor.tags.length > 0 ? (
                    <div className="flex min-w-0 items-center gap-1" title={monitor.tags.join(", ")}>
                      <span className="min-w-0 truncate rounded border border-border bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">{monitor.tags[0]}</span>
                      {monitor.tags.length > 1 ? <span className="shrink-0 text-[9px] text-muted-foreground">+{monitor.tags.length - 1}</span> : null}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">--</span>
                  )}
                </TableCell>
                <TableCell className="overflow-hidden px-1">
                  <div className="truncate" title={getStatusDescription(monitor)}>
                    <StatusBadge
                      status={monitor.status}
                      code={monitor.statusCode}
                      isActive={monitor.isActive}
                      verificationMode={monitor.verificationMode}
                      verificationFailureCount={monitor.verificationFailureCount}
                      threshold={Math.max(1, monitor.retries)}
                      slow={isSlowMonitor(monitor)}
                    />
                  </div>
                </TableCell>
                <TableCell className="px-1" onClick={(event) => event.stopPropagation()}>
                  <div className="flex items-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={activeTogglePendingId === monitor.id}
                      aria-label={monitor.isActive ? `Disable ${monitor.name}` : `Enable ${monitor.name}`}
                      title={monitor.isActive ? "Disable monitor" : "Enable monitor"}
                      onClick={() => onToggleActive(monitor)}
                    >
                      <Power className={`size-3.5 ${monitor.isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="px-1.5">{monitor.statusCode ?? "--"}</TableCell>
                <TableCell className="px-1.5" title={monitor.slowResponseThresholdMs ? `Alert threshold: ${monitor.slowResponseThresholdMs}ms` : undefined}>
                  {monitor.latencyMs ? `${monitor.latencyMs}ms` : "--"}
                </TableCell>
                <TableCell className="px-1.5"><NotificationBadge pref={monitor.notificationPref} /></TableCell>
                <TableCell className="overflow-hidden px-1.5"><span className="block truncate" title={monitor.company ?? undefined}>{monitor.company ?? "--"}</span></TableCell>
                <TableCell className="px-1.5">
                  <MonitorHistoryStrip
                    points={historyByMonitor[monitor.id] ?? []}
                    onSelect={(point) => onSelectTimelinePoint(monitor, point)}
                    compact
                  />
                </TableCell>
                <TableCell className="overflow-hidden px-1.5"><span className="block truncate text-muted-foreground" title={formatLastChecked(monitor.lastCheckedAt)}>{formatLastChecked(monitor.lastCheckedAt)}</span></TableCell>
                <TableCell className="px-1.5">{monitor.uptime}</TableCell>
                <TableCell className="px-0.5" onClick={(event) => event.stopPropagation()}>
                  <div className="flex items-center justify-end gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={flagPendingId === monitor.id}
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
                      disabled={flagPendingId === monitor.id}
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
      loading={loading}
      historyByMonitor={historyByMonitor}
      selectedIds={selectedIds}
      activeTogglePendingId={activeTogglePendingId}
      flagPendingId={flagPendingId}
      allPageSelected={allPageSelected}
      somePageSelected={somePageSelected}
      onToggleAll={onToggleAll}
      onToggleOne={onToggleOne}
      onToggleActive={onToggleActive}
      onToggleFlag={onToggleFlag}
      onEdit={onEdit}
      onSelectTimelinePoint={onSelectTimelinePoint}
      />
    </>
  );
}

function MobileMonitorList({
  monitors,
  loading,
  historyByMonitor,
  selectedIds,
  activeTogglePendingId,
  flagPendingId,
  allPageSelected,
  somePageSelected,
  onToggleAll,
  onToggleOne,
  onToggleActive,
  onToggleFlag,
  onEdit,
  onSelectTimelinePoint,
}: {
  monitors: MonitorRecord[];
  loading: boolean;
  historyByMonitor: Record<string, MonitorHistoryPoint[]>;
  selectedIds: Set<string>;
  activeTogglePendingId: string | null;
  flagPendingId: string | null;
  allPageSelected: boolean;
  somePageSelected: boolean;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onToggleActive: (monitor: MonitorRecord) => void;
  onToggleFlag: (monitor: MonitorRecord, field: "isFavorite" | "isCritical") => void;
  onEdit: (monitor: MonitorRecord) => void;
  onSelectTimelinePoint: (monitor: MonitorRecord, point: MonitorHistoryPoint) => void;
}) {
  if (loading) {
    return <div className="rounded-lg border border-border px-4 py-10 text-center text-sm text-muted-foreground md:hidden">Loading monitors...</div>;
  }

  if (monitors.length === 0) {
    return (
      <div className="md:hidden">
        <EmptyState
          icon={SearchX}
          title="No monitors found"
          description="Adjust the filters or add a monitor to start collecting uptime checks."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 md:hidden">
      <div className="flex items-center justify-between border-b pb-2">
        <button type="button" onClick={onToggleAll} className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
          {allPageSelected ? <CheckSquare className="size-4 text-primary" /> : somePageSelected ? <Square className="size-4 text-primary opacity-60" /> : <Square className="size-4" />}
          Select page
        </button>
        <span className="text-xs text-muted-foreground">Tap a monitor to edit</span>
      </div>
      {monitors.map((monitor) => (
        <MobileMonitorCard
          key={monitor.id}
          monitor={monitor}
          history={historyByMonitor[monitor.id] ?? []}
          selected={selectedIds.has(monitor.id)}
          activePending={activeTogglePendingId === monitor.id}
          flagPending={flagPendingId === monitor.id}
          onToggleOne={onToggleOne}
          onToggleActive={onToggleActive}
          onToggleFlag={onToggleFlag}
          onEdit={onEdit}
          onSelectTimelinePoint={onSelectTimelinePoint}
        />
      ))}
    </div>
  );
}

function MobileMonitorCard({
  monitor,
  history,
  selected,
  activePending,
  flagPending,
  onToggleOne,
  onToggleActive,
  onToggleFlag,
  onEdit,
  onSelectTimelinePoint,
}: {
  monitor: MonitorRecord;
  history: MonitorHistoryPoint[];
  selected: boolean;
  activePending: boolean;
  flagPending: boolean;
  onToggleOne: (id: string) => void;
  onToggleActive: (monitor: MonitorRecord) => void;
  onToggleFlag: (monitor: MonitorRecord, field: "isFavorite" | "isCritical") => void;
  onEdit: (monitor: MonitorRecord) => void;
  onSelectTimelinePoint: (monitor: MonitorRecord, point: MonitorHistoryPoint) => void;
}) {
  function openOnEnter(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onEdit(monitor);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onEdit(monitor)}
      onKeyDown={openOnEnter}
      className={`rounded-lg border p-4 ${selected ? "border-primary/50 bg-primary/5" : "border-border bg-background"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{monitor.name}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{getMonitorTypeLabel(monitor.monitorType)}</p>
        </div>
        <div onClick={(event) => event.stopPropagation()}>
          <StatusBadge
            status={monitor.status}
            code={monitor.statusCode}
            isActive={monitor.isActive}
            verificationMode={monitor.verificationMode}
            verificationFailureCount={monitor.verificationFailureCount}
            threshold={Math.max(1, monitor.retries)}
            slow={isSlowMonitor(monitor)}
          />
        </div>
      </div>
      <p className="mt-3 break-all text-xs text-muted-foreground">{getMonitorTargetDisplay(monitor)}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 border-y py-3 text-xs">
        <MobileMetric label="HTTP" value={monitor.statusCode ? String(monitor.statusCode) : "--"} />
        <MobileMetric label="Latency" value={monitor.latencyMs ? `${monitor.latencyMs}ms` : "--"} />
        <MobileMetric label="Uptime" value={monitor.uptime} />
      </div>
      <div className="mt-3" onClick={(event) => event.stopPropagation()}>
        <MonitorHistoryStrip points={history} onSelect={(point) => onSelectTimelinePoint(monitor, point)} compact />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={() => onToggleOne(monitor.id)} className="inline-flex min-h-11 items-center gap-2 text-xs text-muted-foreground">
          {selected ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
          Select
        </button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-10 w-10 p-0" disabled={activePending} aria-label={monitor.isActive ? `Disable ${monitor.name}` : `Enable ${monitor.name}`} onClick={() => onToggleActive(monitor)}>
            <Power className={`size-4 ${monitor.isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} />
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
      </div>
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
  if (!monitor.isActive) return "Paused";
  if (monitor.verificationMode) return `Verification pending · ${monitor.verificationFailureCount}/${Math.max(1, monitor.retries)}`;
  if (isSlowMonitor(monitor)) return "Online but above the configured latency threshold";
  if (monitor.status === "up") return "Online";
  if (monitor.status === "down") return monitor.statusCode ? `Offline · HTTP ${monitor.statusCode}` : "Offline";
  return "Pending first check";
}
