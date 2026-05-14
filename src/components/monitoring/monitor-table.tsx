import { CheckCircle2, CheckSquare, Clock, Globe, Mail, Power, Send, Settings2, Square, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonitorHistoryStrip } from "@/components/monitoring/monitor-history-strip";
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
}: {
  status: SiteStatus;
  code: number | null;
  isActive: boolean;
  verificationMode: boolean;
  verificationFailureCount: number;
  threshold: number;
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

  if (status === "up") {
    return <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="size-3" />ONLINE</Badge>;
  }
  if (status === "down") {
    return <Badge variant="outline" className="gap-1 border-destructive/30 text-destructive"><XCircle className="size-3" />OFFLINE{code ? ` · ${code}` : ""}</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground">PENDING</Badge>;
}

function NotificationBadge({ pref }: { pref: NotificationPref }) {
  if (pref === "email") return <div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="size-3" />Email</div>;
  if (pref === "telegram") return <div className="flex items-center gap-1 text-xs text-muted-foreground"><Send className="size-3" />Telegram</div>;
  if (pref === "both") return <div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="size-3" />Email + Telegram</div>;
  return <div className="text-xs text-muted-foreground">None</div>;
}

export function MonitorTable({
  monitors,
  loading,
  historyByMonitor,
  selectedIds,
  activeTogglePendingId,
  allPageSelected,
  somePageSelected,
  onToggleAll,
  onToggleOne,
  onToggleActive,
  onEdit,
  onSelectTimelinePoint,
}: {
  monitors: MonitorRecord[];
  loading: boolean;
  historyByMonitor: Record<string, MonitorHistoryPoint[]>;
  selectedIds: Set<string>;
  activeTogglePendingId: string | null;
  allPageSelected: boolean;
  somePageSelected: boolean;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onToggleActive: (monitor: MonitorRecord) => void;
  onEdit: (monitor: MonitorRecord) => void;
  onSelectTimelinePoint: (monitor: MonitorRecord, point: MonitorHistoryPoint) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-surface-high hover:bg-surface-high">
            <TableHead className="w-10 pl-4">
              <button type="button" onClick={onToggleAll} className="flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Select all">
                {allPageSelected ? <CheckSquare className="size-4 text-primary" /> : somePageSelected ? <Square className="size-4 text-primary opacity-60" /> : <Square className="size-4" />}
              </button>
            </TableHead>
            <TableHead className="w-[160px]">Name</TableHead>
            <TableHead>Target</TableHead>
            <TableHead className="w-[150px]">Tags</TableHead>
            <TableHead className="w-[110px]">Status</TableHead>
            <TableHead className="w-[80px]">Active</TableHead>
            <TableHead className="w-[90px]">Response</TableHead>
            <TableHead className="w-[90px]">Latency</TableHead>
            <TableHead className="w-[120px]">Notification</TableHead>
            <TableHead className="w-[96px]">Company</TableHead>
            <TableHead className="w-[96px]">Timeline</TableHead>
            <TableHead className="w-[110px]">Last check</TableHead>
            <TableHead className="w-[80px]">Uptime</TableHead>
            <TableHead className="w-[50px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={14} className="py-12 text-center text-sm text-muted-foreground">Loading monitors...</TableCell>
            </TableRow>
          ) : monitors.length === 0 ? (
            <TableRow>
              <TableCell colSpan={14} className="py-12 text-center text-sm text-muted-foreground">No monitors found.</TableCell>
            </TableRow>
          ) : (
            monitors.map((monitor) => (
              <TableRow key={monitor.id} className={selectedIds.has(monitor.id) ? "bg-primary/5" : ""} onClick={() => onEdit(monitor)}>
                <TableCell className="pl-4" onClick={(event) => event.stopPropagation()}>
                  <button type="button" onClick={(event) => { event.stopPropagation(); onToggleOne(monitor.id); }} className="flex items-center justify-center text-muted-foreground hover:text-foreground" aria-label="Select row">
                    {selectedIds.has(monitor.id) ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
                  </button>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className={`size-1.5 rounded-full ${monitor.status === "up" ? "bg-emerald-500" : monitor.status === "down" ? "bg-destructive" : "bg-muted-foreground"}`} />
                    <div className="space-y-1">
                      <span className="font-medium">{monitor.name}</span>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        {getMonitorTypeLabel(monitor.monitorType)}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Globe className="size-3" />
                    <span className="max-w-[210px] truncate font-mono">{getMonitorTargetDisplay(monitor)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {monitor.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {monitor.tags.map((tag) => (
                        <span key={tag} className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">--</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <StatusBadge
                      status={monitor.status}
                      code={monitor.statusCode}
                      isActive={monitor.isActive}
                      verificationMode={monitor.verificationMode}
                      verificationFailureCount={monitor.verificationFailureCount}
                      threshold={Math.max(1, monitor.retries)}
                    />
                    {monitor.isActive && monitor.verificationMode ? (
                      <p className="text-[11px] text-muted-foreground">Pending confirmation</p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${monitor.isActive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                      {monitor.isActive ? "On" : "Off"}
                    </span>
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
                <TableCell>{monitor.statusCode ?? "--"}</TableCell>
                <TableCell>{monitor.latencyMs ? `${monitor.latencyMs}ms` : "--"}</TableCell>
                <TableCell><NotificationBadge pref={monitor.notificationPref} /></TableCell>
                <TableCell>{monitor.company ?? "--"}</TableCell>
                <TableCell>
                  <MonitorHistoryStrip
                    points={historyByMonitor[monitor.id] ?? []}
                    onSelect={(point) => onSelectTimelinePoint(monitor, point)}
                  />
                </TableCell>
                <TableCell><div className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3" />{formatLastChecked(monitor.lastCheckedAt)}</div></TableCell>
                <TableCell>{monitor.uptime}</TableCell>
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(monitor)}>
                    <Settings2 className="size-3.5 text-muted-foreground" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
