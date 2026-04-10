"use client";

import { useMemo, useState } from "react";
import {
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Square,
} from "lucide-react";
import { LevelBadge } from "@/components/logs/log-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LogRecord } from "@/lib/logs/types";

const PAGE_SIZE_OPTIONS = ["10", "25", "50", "100"] as const;

export function LogsTable({
  logs,
  total,
  loading,
  selectedIds,
  highlightIds,
  page,
  pageSize,
  onToggleSelect,
  onToggleAll,
  onPageChange,
  onPageSizeChange,
}: {
  logs: LogRecord[];
  total: number;
  loading: boolean;
  selectedIds: Set<string>;
  highlightIds: Set<string>;
  page: number;
  pageSize: number;
  onToggleSelect: (id: string) => void;
  onToggleAll: (visibleIds: string[]) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const allVisibleSelected = logs.length > 0 && logs.every((log) => selectedIds.has(log.id));
  const pageButtons = useMemo(() => buildPageButtons(safePage, totalPages), [safePage, totalPages]);

  return (
    <Card className="overflow-hidden border-border/80">
      <CardHeader className="border-b bg-muted/10 pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-base">Log stream</CardTitle>
            <CardDescription>
              {total} event{total === 1 ? "" : "s"} matched. Healthy checks are merged into one active up-state row per monitor.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows</span>
            <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
              <SelectTrigger className="w-24">
                <SelectValue placeholder="10" />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-100/60 dark:bg-slate-900/40">
              <TableHead className="w-14 pl-4">
                <button
                  type="button"
                  onClick={() => onToggleAll(logs.map((log) => log.id))}
                  className="flex items-center justify-center text-muted-foreground"
                >
                  {allVisibleSelected ? (
                    <CheckSquare className="h-4 w-4 text-primary" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </button>
              </TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Monitor</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                  Loading logs...
                </TableCell>
              </TableRow>
            ) : null}
            {!loading && logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                  No logs found for the current filters.
                </TableCell>
              </TableRow>
            ) : null}
            {!loading
              ? logs.map((log) => (
                  <ExpandedRow
                    key={log.id}
                    expanded={expandedId === log.id}
                    highlighted={highlightIds.has(log.id)}
                    log={log}
                    selected={selectedIds.has(log.id)}
                    onToggleExpand={() =>
                      setExpandedId((current) => (current === log.id ? null : log.id))
                    }
                    onToggleSelect={() => onToggleSelect(log.id)}
                  />
                ))
              : null}
          </TableBody>
        </Table>

        <div className="flex flex-col gap-3 border-t bg-muted/10 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-muted-foreground">
            Page {safePage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, safePage - 1))}
              disabled={safePage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1">
              {pageButtons.map((item, index) =>
                item === "ellipsis" ? (
                  <span key={`ellipsis-${index}`} className="px-2 text-xs text-muted-foreground">
                    ...
                  </span>
                ) : (
                  <Button
                    key={item}
                    variant={item === safePage ? "default" : "outline"}
                    size="sm"
                    className="min-w-9"
                    onClick={() => onPageChange(item)}
                  >
                    {item}
                  </Button>
                )
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
              disabled={safePage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ExpandedRow({
  expanded,
  highlighted,
  log,
  selected,
  onToggleExpand,
  onToggleSelect,
}: {
  expanded: boolean;
  highlighted: boolean;
  log: LogRecord;
  selected: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
}) {
  return (
    <>
      <TableRow className={buildRowClass(log, selected, highlighted)}>
        <TableCell className="pl-4">
          <button
            type="button"
            onClick={onToggleSelect}
            className="flex items-center justify-center text-muted-foreground"
          >
            {selected ? (
              <CheckSquare className="h-4 w-4 text-primary" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </button>
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {new Date(log.createdAt).toLocaleString()}
        </TableCell>
        <TableCell>
          <LevelBadge level={log.level} />
        </TableCell>
        <TableCell>
          <StatusBadge status={log.status} />
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="border-border/70 font-mono text-xs">
            {log.statusCode ?? "--"}
          </Badge>
        </TableCell>
        <TableCell>{log.companyName ?? "Unassigned"}</TableCell>
        <TableCell>{log.monitorName ?? "--"}</TableCell>
        <TableCell>
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex w-full items-start justify-between gap-3 text-left"
          >
            <div className="space-y-1">
              <p className="text-sm">{log.message ?? log.eventType}</p>
              <p className="text-xs text-muted-foreground">
                {log.eventType === "up-summary"
                  ? "Healthy summary. Click to see uptime details."
                  : log.detailSummary ?? log.eventType}
              </p>
            </div>
            <ChevronDown
              className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
            />
          </button>
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow className="bg-muted/10">
          <TableCell colSpan={8} className="px-6 py-4">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">{log.detailTitle ?? "Log details"}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {log.detailSummary ?? "No additional context available."}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {log.detailItems.map((item) => (
                  <div
                    key={`${log.id}-${item.label}`}
                    className="rounded-lg border border-l-2 border-l-sky-500 bg-background px-3 py-3"
                  >
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-2 break-all text-sm font-medium">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === "up") {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
      >
        UP
      </Badge>
    );
  }

  if (status === "down") {
    return (
      <Badge variant="outline" className="border-destructive/30 text-destructive">
        DOWN
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="border-border/70 text-muted-foreground">
      --
    </Badge>
  );
}

function buildRowClass(log: LogRecord, selected: boolean, highlighted: boolean) {
  if (selected) {
    return "bg-primary/5";
  }

  if (highlighted) {
    return "bg-sky-500/8 ring-1 ring-sky-500/20";
  }

  if (log.status === "down") {
    return "bg-destructive/5 hover:bg-destructive/10";
  }

  if (log.status === "up") {
    return "hover:bg-emerald-500/5";
  }

  return "hover:bg-muted/10";
}

function buildPageButtons(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, "ellipsis", totalPages] as const;
  }

  if (currentPage >= totalPages - 2) {
    return [1, "ellipsis", totalPages - 3, totalPages - 2, totalPages - 1, totalPages] as const;
  }

  return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages] as const;
}
