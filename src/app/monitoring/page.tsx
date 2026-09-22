"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Plus,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Tags,
  Trash2,
  Undo2,
} from "lucide-react";
import { MonitorConfigDialog } from "@/components/monitoring/monitor-config-dialog";
import { MonitorExportDialog } from "@/components/monitoring/monitor-export-dialog";
import { MonitorForm } from "@/components/monitoring/monitor-form";
import { MonitorHistoryDialog } from "@/components/monitoring/monitor-history-dialog";
import { MonitorImportDialog } from "@/components/monitoring/monitor-import-dialog";
import { MonitorPauseDialog } from "@/components/monitoring/monitor-pause-dialog";
import { MonitorStats } from "@/components/monitoring/monitor-stats";
import { MonitorTable } from "@/components/monitoring/monitor-table";
import { DEFAULT_MONITOR_COLUMNS, MONITOR_OPTIONAL_COLUMNS, parseMonitorTablePreferences, type MonitorOptionalColumn } from "@/components/monitoring/monitor-table-columns";
import { MonitorTagsDialog } from "@/components/monitoring/monitor-tags-dialog";
import { MonitorTextImportDialog } from "@/components/monitoring/monitor-text-import-dialog";
import { WorkerPulseCard } from "@/components/monitoring/worker-pulse-card";
import { payloadFromMonitor } from "@/components/monitoring/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CompanyRecord } from "@/lib/companies/types";
import { buildDefaultMonitorForm } from "@/lib/monitors/defaults";
import { isMonitorTemporarilyPaused, type MonitorPauseUnit } from "@/lib/monitors/pause";
import {
  DEFAULT_MONITOR_FORM,
  type MonitorDiagnosticRecord,
  type MonitorHistoryPoint,
  type MonitorOutageEventRecord,
  type MonitorPayload,
  type MonitorRecord,
} from "@/lib/monitors/types";
import type { SettingsPayload } from "@/lib/settings/types";
import { showToast } from "@/lib/client-toast";
import { parseSoftDeleteUndoDeadline } from "@/lib/soft-delete";
import { useMonitoringStore } from "@/stores/use-monitoring-store";
import { hasPermission } from "@/lib/auth/permissions";
import { LatestRequestCommitter } from "@/lib/client/latest-request";

const ALL_MONITORS_PAGE_SIZE = 500;
const PAGE_SIZE_OPTIONS = [10, 50, 100, ALL_MONITORS_PAGE_SIZE] as const;
const PAGE_NUMBER_WINDOW = 5;
const MAX_BROWSER_TIMEOUT_MS = 2_147_000_000;

type MonitorStatusFilter = "all" | "up" | "down";

interface BulkProgress {
  title: string;
  detail: string;
  count: number;
}

interface PendingMonitorRestore {
  ids: string[];
  expiresAt: number;
}

export default function MonitoringPage() {
  const {
    monitors,
    pagination,
    summary,
    loading,
    saving,
    error,
    loadMonitors,
    createMonitor,
    updateMonitor,
    updateMonitorActiveState,
    updateMonitorPause,
    updateMonitorFlags,
    bulkUpdateMonitors,
    bulkMoveMonitorsToCompany,
    bulkUpdateMonitorPublication,
    resetMonitorHistory,
    deleteMonitors,
    restoreMonitors,
    importMonitors,
    clearError,
  } = useMonitoringStore();
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<MonitorStatusFilter>("all");
  const [sort, setSort] = useState<"createdAt" | "name" | "status" | "lastCheckedAt" | "latencyMs">("createdAt");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [visibleColumns, setVisibleColumns] = useState<MonitorOptionalColumn[]>(DEFAULT_MONITOR_COLUMNS);
  const [preferencesLoadedFor, setPreferencesLoadedFor] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [textImportOpen, setTextImportOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [editingMonitor, setEditingMonitor] = useState<MonitorRecord | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkCompanyOpen, setBulkCompanyOpen] = useState(false);
  const [bulkCompanyId, setBulkCompanyId] = useState("");
  const [bulkPublicationOpen, setBulkPublicationOpen] = useState(false);
  const [publishSelected, setPublishSelected] = useState(true);
  const [tagPatchOpen, setTagPatchOpen] = useState(false);
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [savedEmails, setSavedEmails] = useState<string[]>([]);
  const [workspaceSettings, setWorkspaceSettings] = useState<SettingsPayload | null>(null);
  const [defaultForm, setDefaultForm] = useState(DEFAULT_MONITOR_FORM);
  const [historyByMonitor, setHistoryByMonitor] = useState<Record<string, MonitorHistoryPoint[]>>({});
  const [diagnosticsByMonitor, setDiagnosticsByMonitor] = useState<Record<string, MonitorDiagnosticRecord[]>>({});
  const [outageEventsByMonitor, setOutageEventsByMonitor] = useState<Record<string, MonitorOutageEventRecord[]>>({});
  const [timelineMonitor, setTimelineMonitor] = useState<MonitorRecord | null>(null);
  const [selectedTimelinePointId, setSelectedTimelinePointId] = useState<string | null>(null);
  const [activeTogglePendingId, setActiveTogglePendingId] = useState<string | null>(null);
  const [pausePendingId, setPausePendingId] = useState<string | null>(null);
  const [pauseTargetIds, setPauseTargetIds] = useState<string[]>([]);
  const [flagPendingId, setFlagPendingId] = useState<string | null>(null);
  const [recheckPendingId, setRecheckPendingId] = useState<string | null>(null);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);
  const [resetTargetIds, setResetTargetIds] = useState<string[]>([]);
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);
  const [pendingRestores, setPendingRestores] = useState<PendingMonitorRestore[]>([]);
  const latestTimelineRequestRef = useRef(0);
  const historyRequestsRef = useRef(new LatestRequestCommitter());
  const supportingDataRequestsRef = useRef(new LatestRequestCommitter());
  const canManageMonitors = workspaceSettings
    ? hasPermission(workspaceSettings.profile.role, "monitors.manage")
    : false;
  const preferenceKey = workspaceSettings?.profile.email
    ? `sentrovia:monitor-table:${workspaceSettings.profile.email.toLowerCase()}`
    : null;

  useEffect(() => {
    if (!preferenceKey || preferencesLoadedFor === preferenceKey) return;
    try {
      const preferences = parseMonitorTablePreferences(window.localStorage.getItem(preferenceKey));
      if (preferences) {
        setVisibleColumns(preferences.columns);
        setPageSize(preferences.pageSize as (typeof PAGE_SIZE_OPTIONS)[number]);
        setSort(preferences.sort);
        setDirection(preferences.direction);
      } else {
        setVisibleColumns(DEFAULT_MONITOR_COLUMNS);
        setPageSize(10);
        setSort("createdAt");
        setDirection("desc");
      }
    } catch {
      // Browser storage can be unavailable; the table remains usable with defaults.
    }
    setPreferencesLoadedFor(preferenceKey);
  }, [preferenceKey, preferencesLoadedFor]);

  useEffect(() => {
    if (!preferenceKey || preferencesLoadedFor !== preferenceKey) return;
    try {
      window.localStorage.setItem(preferenceKey, JSON.stringify({
        columns: visibleColumns, pageSize, sort, direction,
      }));
    } catch {
      // Preferences are optional when browser storage is unavailable.
    }
  }, [direction, pageSize, preferenceKey, preferencesLoadedFor, sort, visibleColumns]);

  const problematicCount = useMemo(
    () => monitors.filter((monitor) => monitor.isActive && !isMonitorTemporarilyPaused(monitor.pausedUntil) && (monitor.status === "down" || monitor.verificationMode)).length,
    [monitors]
  );

  const totalPages = pagination.totalPages;
  const currentPage = Math.min(page, totalPages);
  const visiblePages = buildVisiblePages(currentPage, totalPages, PAGE_NUMBER_WINDOW);
  const paginated = monitors;
  const allPageSelected = paginated.length > 0 && paginated.every((monitor) => selectedIds.has(monitor.id));
  const somePageSelected = paginated.some((monitor) => selectedIds.has(monitor.id));
  const bulkEditTemplate = useMemo(() => {
    const firstSelected = monitors.find((monitor) => selectedIds.has(monitor.id));
    return firstSelected ? payloadFromMonitor(firstSelected) : defaultForm;
  }, [defaultForm, monitors, selectedIds]);
  const deleteTargets = monitors.filter((monitor) => deleteTargetIds.includes(monitor.id));
  const resetTargets = monitors.filter((monitor) => resetTargetIds.includes(monitor.id));
  const selectedActiveMonitors = monitors.filter((monitor) => selectedIds.has(monitor.id) && monitor.isActive);
  const selectedPausedMonitorIds = selectedActiveMonitors
    .filter((monitor) => isMonitorTemporarilyPaused(monitor.pausedUntil))
    .map((monitor) => monitor.id);
  const parsedNextPauseExpiryMs = summary.nextPauseExpiryAt
    ? Date.parse(summary.nextPauseExpiryAt)
    : Number.NaN;
  const nextPauseExpiryMs = Number.isFinite(parsedNextPauseExpiryMs)
    ? parsedNextPauseExpiryMs
    : null;

  const loadSupportingData = useCallback(async () => {
    await supportingDataRequestsRef.current.run(
      "monitoring-supporting-data",
      async () => {
        try {
          const [companiesResponse, settingsResponse] = await Promise.all([
            fetch("/api/companies", { cache: "no-store" }),
            fetch("/api/settings", { cache: "no-store" }),
          ]);
          const companiesData = await readJsonOrNull<{ companies?: CompanyRecord[] }>(companiesResponse);
          const settingsData = await readJsonOrNull<{ settings?: SettingsPayload | null }>(settingsResponse);
          const settings = settingsResponse.ok ? settingsData?.settings ?? null : null;

          return {
            companies: companiesResponse.ok ? companiesData?.companies ?? [] : [],
            settings,
          };
        } catch {
          return { companies: [], settings: null };
        }
      },
      ({ companies: nextCompanies, settings }) => {
        setCompanies(nextCompanies);
        setWorkspaceSettings(settings);
        setSavedEmails(settings?.notifications.savedEmailRecipients ?? []);
        setDefaultForm(buildDefaultMonitorForm(settings));
      }
    );
  }, []);

  const loadMonitorHistory = useCallback(async (monitorId: string) => {
    const snapshot = await historyRequestsRef.current.run(
      monitorId,
      async () => {
        try {
          const response = await fetch(
            `/api/monitors/history?monitorId=${encodeURIComponent(monitorId)}`,
            { cache: "no-store" }
          );
          const data = await readJsonOrNull<{
            history?: Record<string, MonitorHistoryPoint[]>;
            diagnostics?: Record<string, MonitorDiagnosticRecord[]>;
            outageEvents?: Record<string, MonitorOutageEventRecord[]>;
          }>(response);

          return {
            points: response.ok ? data?.history?.[monitorId] ?? [] : [],
            diagnostics: response.ok ? data?.diagnostics?.[monitorId] ?? [] : [],
            outageEvents: response.ok ? data?.outageEvents?.[monitorId] ?? [] : [],
          };
        } catch {
          return { points: [], diagnostics: [], outageEvents: [] };
        }
      },
      ({ points, diagnostics, outageEvents }) => {
        setHistoryByMonitor((current) => ({ ...current, [monitorId]: points }));
        setDiagnosticsByMonitor((current) => ({ ...current, [monitorId]: diagnostics }));
        setOutageEventsByMonitor((current) => ({ ...current, [monitorId]: outageEvents }));
      }
    );
    return snapshot?.points ?? null;
  }, []);

  const loadMonitorPage = useCallback((options?: { silent?: boolean }) => loadMonitors({
    page,
    pageSize,
    search,
    companyId: companyFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
    sort,
    direction,
  }, options), [companyFilter, direction, loadMonitors, page, pageSize, search, sort, statusFilter]);

  const refreshMonitoring = useCallback(async () => {
    await Promise.all([loadMonitorPage(), loadSupportingData()]);
  }, [loadMonitorPage, loadSupportingData]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadMonitorPage(), 250);
    return () => window.clearTimeout(timeoutId);
  }, [loadMonitorPage]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadMonitorPage({ silent: true });
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [loadMonitorPage]);

  useEffect(() => {
    if (nextPauseExpiryMs === null) {
      return;
    }

    let timeoutId: number;
    const scheduleRefresh = () => {
      const remainingMs = nextPauseExpiryMs - Date.now();
      if (remainingMs >= MAX_BROWSER_TIMEOUT_MS) {
        timeoutId = window.setTimeout(scheduleRefresh, MAX_BROWSER_TIMEOUT_MS);
        return;
      }

      timeoutId = window.setTimeout(
        () => void loadMonitorPage(),
        Math.max(0, remainingMs) + 250
      );
    };

    scheduleRefresh();
    return () => window.clearTimeout(timeoutId);
  }, [loadMonitorPage, nextPauseExpiryMs]);

  useEffect(() => {
    queueMicrotask(() => void loadSupportingData());
  }, [loadSupportingData]);

  useEffect(() => {
    if (page > pagination.totalPages) {
      setPage(pagination.totalPages);
    }
  }, [page, pagination.totalPages]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [companyFilter, direction, page, pageSize, search, sort, statusFilter]);

  useEffect(() => {
    if (!bulkProgress) {
      return;
    }

    const preventAccidentalClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", preventAccidentalClose);
    return () => window.removeEventListener("beforeunload", preventAccidentalClose);
  }, [bulkProgress]);

  useEffect(() => {
    if (pendingRestores.length === 0) return;
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setPendingRestores((current) => {
        const active = current.filter((item) => item.expiresAt > now);
        return active.length === current.length ? current : active;
      });
    }, 500);
    return () => window.clearInterval(intervalId);
  }, [pendingRestores.length]);

  useEffect(() => {
    const search = typeof window === "undefined" ? "" : window.location.search;
    const params = new URLSearchParams(search);
    const requestedSearch = params.get("search")?.trim();
    const frameId = window.requestAnimationFrame(() => {
      if (requestedSearch) setSearch(requestedSearch);
      if (params.get("create") === "1") setCreateOpen(true);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  async function handleCreate(payload: MonitorPayload) {
    const created = await createMonitor(payload);
    if (created) {
      await loadMonitorPage();
      setCreateOpen(false);
    }
  }

  async function handleUpdate(payload: MonitorPayload) {
    if (!editingMonitor) {
      return;
    }

    const updated = await updateMonitor(editingMonitor.id, payload);
    if (updated) {
      setEditingMonitor(null);
      await loadMonitorPage();
    }
  }

  async function handleBulkUpdate(payload: MonitorPayload) {
    const ids = Array.from(selectedIds);
    setBulkEditOpen(false);
    await runBulkAction(
      `Updating ${ids.length} monitor${ids.length === 1 ? "" : "s"}`,
      "Schedule, check, notification, tag, and template settings will be updated.",
      ids.length,
      async () => {
        const updated = await bulkUpdateMonitors(ids, payload);
        if (updated.length > 0) {
          await loadMonitorPage();
          setSelectedIds((current) => removeIds(current, updated.map((monitor) => monitor.id)));
        }
      }
    );
  }

  async function handleBulkCompanyMove() {
    const ids = Array.from(selectedIds);
    const companyId = bulkCompanyId === "unassigned" ? null : bulkCompanyId;
    const destination = companies.find((company) => company.id === companyId)?.name ?? "Unassigned";
    setBulkCompanyOpen(false);
    await runBulkAction(
      `Moving ${ids.length} monitor${ids.length === 1 ? "" : "s"}`,
      `Assigning selected monitors to ${destination}.`,
      ids.length,
      async () => {
        const updated = await bulkMoveMonitorsToCompany(ids, companyId);
        if (updated.length > 0) {
          await Promise.all([loadMonitorPage(), loadSupportingData()]);
          setSelectedIds((current) => removeIds(current, updated.map((monitor) => monitor.id)));
        }
      }
    );
  }

  async function handleBulkPublication() {
    const ids = Array.from(selectedIds);
    setBulkPublicationOpen(false);
    await runBulkAction(
      `${publishSelected ? "Publishing" : "Unpublishing"} ${ids.length} monitors`,
      "Updating public status visibility for selected monitors.",
      ids.length,
      async () => {
        const updated = await bulkUpdateMonitorPublication(ids, publishSelected);
        if (updated.length > 0) {
          await loadMonitorPage();
          setSelectedIds((current) => removeIds(current, updated.map((monitor) => monitor.id)));
        }
      }
    );
  }

  async function handleToggleMonitorActive(monitor: MonitorRecord) {
    setActiveTogglePendingId(monitor.id);

    try {
      const updated = await updateMonitorActiveState(monitor.id, !monitor.isActive);
      if (updated) {
        await Promise.all([loadMonitorPage(), loadSupportingData()]);
      }
    } finally {
      setActiveTogglePendingId(null);
    }
  }

  function openPauseDialog(ids: string[]) {
    const activeIds = monitors
      .filter((monitor) => ids.includes(monitor.id) && monitor.isActive)
      .map((monitor) => monitor.id);
    if (activeIds.length > 0) {
      setPauseTargetIds(activeIds);
    }
  }

  async function handlePauseMonitors(durationValue: number, durationUnit: MonitorPauseUnit) {
    const updated = await updateMonitorPause(pauseTargetIds, { action: "pause", durationValue, durationUnit });
    if (updated !== null) {
      setPauseTargetIds([]);
      await loadMonitorPage();
    }
  }

  async function handleResumePaused(ids: string[], pendingId: string | null = null) {
    setPausePendingId(pendingId);
    try {
      const updated = await updateMonitorPause(ids, { action: "resume" });
      if (updated !== null) {
        await loadMonitorPage();
      }
    } finally {
      setPausePendingId(null);
    }
  }

  async function handleToggleMonitorFlag(
    monitor: MonitorRecord,
    field: "isFavorite" | "isCritical" | "publishOnStatusPage"
  ) {
    setFlagPendingId(monitor.id);

    try {
      const flags = { [field]: !monitor[field] };
      await updateMonitorFlags(monitor.id, flags);
    } finally {
      setFlagPendingId(null);
    }
  }

  async function handleRecheckMonitor(monitor: MonitorRecord) {
    setRecheckPendingId(monitor.id);
    try {
      const response = await fetch(`/api/monitors/${monitor.id}/recheck`, { method: "POST" });
      const result = await readJsonOrNull<{ message?: string }>(response);
      if (!response.ok) throw new Error(result?.message ?? "Unable to queue monitor check.");
      showToast(`${monitor.name} queued for the next worker cycle.`, "success");
      await loadMonitorPage();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to queue monitor check.", "error");
    } finally {
      setRecheckPendingId(null);
    }
  }

  function openDeleteConfirmation() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }

    clearError();
    setDeleteTargetIds(ids);
  }

  function openResetConfirmation() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      return;
    }

    clearError();
    setResetTargetIds(ids);
  }

  function closeResetConfirmation() {
    if (!saving) {
      setResetTargetIds([]);
    }
  }

  async function confirmResetSelected() {
    if (resetTargetIds.length === 0) {
      return;
    }

    const ids = [...resetTargetIds];
    setResetTargetIds([]);
    await runBulkAction(
      `Resetting ${ids.length} monitor${ids.length === 1 ? "" : "s"}`,
      "Check, report, timeline, outage, diagnostic, and delivery history is being cleared.",
      ids.length,
      async () => {
        const reset = await resetMonitorHistory(ids);
        if (reset.length > 0) {
          await loadMonitorPage();
          setSelectedIds((current) => removeIds(current, reset.map((monitor) => monitor.id)));
          setHistoryByMonitor((current) => omitRecordKeys(current, ids));
          setDiagnosticsByMonitor((current) => omitRecordKeys(current, ids));
          setOutageEventsByMonitor((current) => omitRecordKeys(current, ids));
        }
      }
    );
  }

  function closeDeleteConfirmation() {
    if (!saving) {
      setDeleteTargetIds([]);
    }
  }

  async function confirmDeleteSelected() {
    if (deleteTargetIds.length === 0) {
      return;
    }

    const ids = [...deleteTargetIds];
    setDeleteTargetIds([]);
    await runBulkAction(
      `Deleting ${ids.length} monitor${ids.length === 1 ? "" : "s"}`,
      "Selected monitors and their history are being removed.",
      ids.length,
      async () => {
        const deletion = await deleteMonitors(ids);
        if (deletion && deletion.ids.length > 0) {
          await loadMonitorPage();
          setSelectedIds((current) => removeIds(current, deletion.ids));
          setPendingRestores((current) => [
            ...current,
            { ids: deletion.ids, expiresAt: parseSoftDeleteUndoDeadline(deletion.undoUntil) },
          ]);
        }
      }
    );
  }

  async function runBulkAction(
    title: string,
    detail: string,
    count: number,
    execute: () => Promise<void>
  ) {
    if (bulkProgress) {
      throw new Error("Another bulk operation is already running.");
    }

    setBulkProgress({ title, detail, count });
    try {
      await execute();
    } catch (actionError) {
      showToast(actionError instanceof Error ? actionError.message : "Bulk operation failed.", "error");
      throw actionError;
    } finally {
      setBulkProgress(null);
    }
  }

  async function restoreRecentlyDeletedMonitors() {
    const ids = pendingRestores.flatMap((item) => item.ids);
    if (ids.length === 0) return;
    const restored = await restoreMonitors(ids);
    if (restored.length > 0) {
      setPendingRestores([]);
      await loadMonitorPage();
    }
  }

  function toggleAll() {
    if (allPageSelected) {
      setSelectedIds((current) => {
        const next = new Set(current);
        paginated.forEach((monitor) => next.delete(monitor.id));
        return next;
      });
      return;
    }

    setSelectedIds((current) => {
      const next = new Set(current);
      paginated.forEach((monitor) => next.add(monitor.id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleOpenTimeline(monitor: MonitorRecord) {
    const requestId = ++latestTimelineRequestRef.current;
    const points = await loadMonitorHistory(monitor.id);
    if (points === null || requestId !== latestTimelineRequestRef.current) {
      return;
    }
    setTimelineMonitor(monitor);
    setSelectedTimelinePointId(points.at(-1)?.id ?? null);
  }

  return (
    <div className="min-w-0 space-y-5 animate-in fade-in duration-200">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-1">
          <h1 className="mb-1 text-2xl font-semibold tracking-tight">Monitoring</h1>
          <p className="text-sm text-muted-foreground">
            {pagination.totalItems} endpoints · {problematicCount} problematic on this page
          </p>
        </div>

        <div className="flex flex-wrap gap-2 xl:justify-end">
          {canManageMonitors ? (
            <Button variant="outline" onClick={() => setToolsOpen(true)}>Tools</Button>
          ) : null}
          <Button
            variant="outline"
            size="icon"
            aria-label="Refresh monitors"
            title="Refresh monitors"
            onClick={() => void refreshMonitoring()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
          {canManageMonitors ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus data-icon="inline-start" className="size-4" />
              Add monitor
            </Button>
          ) : null}
        </div>
      </section>

      {error ? (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {pendingRestores.length > 0 ? (
        <div className="flex flex-col gap-3 rounded-md bg-emerald-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="status">
          <div>
            <p className="text-sm font-medium">{pendingRestores.flatMap((item) => item.ids).length} monitor{pendingRestores.flatMap((item) => item.ids).length === 1 ? "" : "s"} deleted</p>
            <p className="mt-1 text-xs text-muted-foreground">Related records remain recoverable for 60 seconds.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void restoreRecentlyDeletedMonitors()} disabled={saving}>
            <Undo2 data-icon="inline-start" /> Restore
          </Button>
        </div>
      ) : null}

      {workspaceSettings?.profile.role === "admin" ? <WorkerPulseCard /> : null}
      <MonitorStats
        summary={summary}
        activeFilter={statusFilter}
        onFilterChange={(filter) => {
          setStatusFilter(filter);
          setPage(1);
        }}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by name, URL, or tag"
            className="pl-9"
          />
        </div>
        <Select
          value={companyFilter}
          onValueChange={(value) => {
            setCompanyFilter(String(value));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder="Filter by company" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All companies</SelectItem>
            {companies.map((company) => (
              <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(value) => { setSort(value as typeof sort); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Sort monitors"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt">Date added</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="status">Status</SelectItem>
            <SelectItem value="lastCheckedAt">Last checked</SelectItem>
            <SelectItem value="latencyMs">Latency</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" aria-label={`Sort ${direction === "asc" ? "descending" : "ascending"}`} onClick={() => { setDirection((current) => current === "asc" ? "desc" : "asc"); setPage(1); }}>
          {direction === "asc" ? "Ascending" : "Descending"}
        </Button>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => {
            setPageSize(Number(value) as (typeof PAGE_SIZE_OPTIONS)[number]);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Rows per page" />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option === ALL_MONITORS_PAGE_SIZE ? "Show all" : `Show ${option}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <details className="relative hidden xl:block">
          <summary className="flex h-9 cursor-pointer list-none items-center rounded-md border border-input px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
            Columns
          </summary>
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-border bg-popover p-2">
            {MONITOR_OPTIONAL_COLUMNS.map((column) => (
              <label key={column.id} className="flex min-h-9 cursor-pointer items-center gap-2 px-2 text-sm">
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(column.id)}
                  onChange={(event) => setVisibleColumns((current) => event.target.checked
                    ? [...current, column.id]
                    : current.filter((id) => id !== column.id))}
                />
                {column.label}
              </label>
            ))}
            <button type="button" className="mt-1 px-2 text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setVisibleColumns(DEFAULT_MONITOR_COLUMNS)}>
              Reset columns
            </button>
          </div>
        </details>
      </div>

      {canManageMonitors && selectedIds.size > 0 ? (
        <div className="flex flex-col gap-3 rounded-md bg-primary/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium">
            {selectedIds.size} monitor{selectedIds.size === 1 ? "" : "s"} selected
          </span>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button variant="outline" size="sm" onClick={() => setBulkEditOpen(true)} disabled={Boolean(bulkProgress)}>
              Bulk edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setBulkCompanyId(""); setBulkCompanyOpen(true); }} disabled={Boolean(bulkProgress)}>
              Change company
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setPublishSelected(true); setBulkPublicationOpen(true); }} disabled={Boolean(bulkProgress)}>
              Public status
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTagPatchOpen(true)} disabled={Boolean(bulkProgress)}>
              <Tags data-icon="inline-start" className="size-3.5" />
              Tags
            </Button>
            <Button variant="outline" size="sm" onClick={() => openPauseDialog(Array.from(selectedIds))} disabled={saving || selectedActiveMonitors.length === 0 || Boolean(bulkProgress)}>
              <Clock data-icon="inline-start" className="size-3.5" />
              Pause
            </Button>
            {selectedPausedMonitorIds.length > 0 ? (
              <Button variant="outline" size="sm" onClick={() => void handleResumePaused(selectedPausedMonitorIds)} disabled={saving || Boolean(bulkProgress)}>
                <Play data-icon="inline-start" className="size-3.5" />
                Resume paused
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())} disabled={Boolean(bulkProgress)}>
              Clear
            </Button>
            <Button variant="outline" size="sm" onClick={openResetConfirmation} disabled={saving || Boolean(bulkProgress)}>
              <RotateCcw data-icon="inline-start" className="size-3.5" />
              Reset history
            </Button>
            <Button variant="destructive" size="sm" onClick={openDeleteConfirmation} disabled={saving || Boolean(bulkProgress)}>
              <Trash2 data-icon="inline-start" className="size-3.5" />
              Delete selected
            </Button>
          </div>
        </div>
      ) : null}

      <MonitorTable
        monitors={paginated}
        visibleColumns={visibleColumns}
        readOnly={!canManageMonitors}
        loading={loading}
        selectedIds={selectedIds}
        activeTogglePendingId={activeTogglePendingId}
        pausePendingId={pausePendingId}
        flagPendingId={flagPendingId}
        recheckPendingId={recheckPendingId}
        allPageSelected={allPageSelected}
        somePageSelected={somePageSelected}
        onToggleAll={toggleAll}
        onToggleOne={toggleOne}
        onToggleActive={(monitor) => void handleToggleMonitorActive(monitor)}
        onPause={(monitor) => openPauseDialog([monitor.id])}
        onResumePause={(monitor) => void handleResumePaused([monitor.id], monitor.id)}
        onToggleFlag={(monitor, field) => void handleToggleMonitorFlag(monitor, field)}
        onRecheck={(monitor) => void handleRecheckMonitor(monitor)}
        onEdit={setEditingMonitor}
        onOpenTimeline={(monitor) => void handleOpenTimeline(monitor)}
        emptyState={search.trim() || companyFilter !== "all" || statusFilter !== "all" ? {
          title: "No monitors match these filters",
          description: "Clear the search, company, and status filters to return to the full monitor list.",
          action: (
            <Button variant="outline" size="sm" onClick={() => { setSearch(""); setCompanyFilter("all"); setStatusFilter("all"); setPage(1); }}>
              Clear filters
            </Button>
          ),
        } : {
          title: "No monitors yet",
          description: canManageMonitors
            ? "Add an endpoint to begin the first verification cycle."
            : "A workspace administrator needs to add the first monitor.",
          action: canManageMonitors ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>Add first monitor</Button>
          ) : undefined,
        }}
      />

      {totalPages > 1 ? (
        <div className="flex flex-col gap-3 rounded-md bg-muted/20 px-3 py-3 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-muted-foreground">Page {currentPage} of {totalPages} · {pageSize} rows</p>
          <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Previous monitor page"
              disabled={currentPage === 1}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            {visiblePages.map((pageNumber) => (
              <Button
                key={pageNumber}
                variant={pageNumber === currentPage ? "default" : "outline"}
                size="sm"
                className="h-8 min-w-8 px-2"
                onClick={() => setPage(pageNumber)}
              >
                {pageNumber}
              </Button>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label="Next monitor page"
              disabled={currentPage === totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
            <div className="flex items-center gap-2 md:pl-2">
              <span className="text-xs text-muted-foreground">Go to</span>
              <Input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) {
                    setPage(Math.max(1, Math.min(totalPages, value)));
                  }
                }}
                className="h-8 w-20"
              />
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={toolsOpen} onOpenChange={setToolsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Monitor tools</DialogTitle>
            <DialogDescription>Import, export, or manage monitor configuration files.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <a
              href="/templates/monitors-template.csv"
              download
              className={buttonVariants({ variant: "outline", className: "w-full justify-start" })}
            >
              <FileSpreadsheet data-icon="inline-start" className="size-4" />
              Download sample CSV
            </a>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                setToolsOpen(false);
                setImportOpen(true);
              }}
            >
              <FileSpreadsheet data-icon="inline-start" className="size-4" />
              Import CSV
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                setToolsOpen(false);
                setTextImportOpen(true);
              }}
            >
              <FileText data-icon="inline-start" className="size-4" />
              Import TXT domain list
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                setToolsOpen(false);
                setExportOpen(true);
              }}
            >
              <Download data-icon="inline-start" className="size-4" />
              Export monitors
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => {
                setToolsOpen(false);
                setConfigOpen(true);
              }}
            >
              <FileCode2 data-icon="inline-start" className="size-4" />
              Monitoring as code
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create monitor</DialogTitle>
            <DialogDescription>Configure the target, check behavior, and alert routing.</DialogDescription>
          </DialogHeader>
          <MonitorForm
            initialValue={defaultForm}
            companies={companies}
            savedEmails={savedEmails}
            submitting={saving}
            submitLabel="Save monitor"
            onCancel={() => setCreateOpen(false)}
            onSubmit={handleCreate}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingMonitor)} onOpenChange={(open) => !open && setEditingMonitor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Monitor settings</DialogTitle>
            <DialogDescription>Change the target, check behavior, alerts, and templates.</DialogDescription>
          </DialogHeader>
          {editingMonitor ? (
            <MonitorForm
              initialValue={payloadFromMonitor(editingMonitor)}
              companies={companies}
              savedEmails={savedEmails}
              submitting={saving}
              monitorId={editingMonitor.id}
              submitLabel="Save changes"
              onCancel={() => setEditingMonitor(null)}
              onSubmit={handleUpdate}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bulk monitor settings</DialogTitle>
            <DialogDescription>
              Update shared schedule, notification, tag, and template settings for the selected monitors. Identity
              fields stay unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
            Impact: {selectedIds.size} selected monitor{selectedIds.size === 1 ? "" : "s"}. Identity fields and targets remain unchanged. The operation starts immediately.
          </div>
          {selectedIds.size > 0 ? (
            <MonitorForm
              initialValue={bulkEditTemplate}
              companies={companies}
              savedEmails={savedEmails}
              submitting={saving}
              submitLabel="Apply to selected monitors"
              mode="bulk"
              onCancel={() => setBulkEditOpen(false)}
              onSubmit={handleBulkUpdate}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={bulkCompanyOpen} onOpenChange={setBulkCompanyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change company</DialogTitle>
            <DialogDescription>Move {selectedIds.size} selected monitor{selectedIds.size === 1 ? "" : "s"} to a company. Check settings and history stay with each monitor. Company notification recipients may change. Published monitors may appear on the destination company&apos;s public status page.</DialogDescription>
          </DialogHeader>
          <Select value={bulkCompanyId} onValueChange={(value) => setBulkCompanyId(String(value))}>
            <SelectTrigger aria-label="Destination company"><SelectValue placeholder="Select company" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {companies.map((company) => <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkCompanyOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleBulkCompanyMove()} disabled={selectedIds.size === 0 || !bulkCompanyId || saving}>Move monitors</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkPublicationOpen} onOpenChange={setBulkPublicationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Public status visibility</DialogTitle>
            <DialogDescription>{selectedIds.size} selected monitor{selectedIds.size === 1 ? "" : "s"}; {monitors.filter((monitor) => selectedIds.has(monitor.id) && monitor.publishOnStatusPage).length} currently published. Published monitors can appear on public status pages for their company or workspace.</DialogDescription>
          </DialogHeader>
          <Select value={publishSelected ? "publish" : "unpublish"} onValueChange={(value) => setPublishSelected(value === "publish")}>
            <SelectTrigger aria-label="Public status action"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="publish">Publish selected</SelectItem>
              <SelectItem value="unpublish">Unpublish selected</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkPublicationOpen(false)}>Cancel</Button>
            <Button onClick={() => void handleBulkPublication()} disabled={selectedIds.size === 0 || saving}>
              {publishSelected ? "Publish" : "Unpublish"} {selectedIds.size} monitor{selectedIds.size === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MonitorPauseDialog
        open={pauseTargetIds.length > 0}
        monitorCount={pauseTargetIds.length}
        submitting={saving}
        onOpenChange={(open) => !open && setPauseTargetIds([])}
        onSubmit={handlePauseMonitors}
      />

      <Dialog open={deleteTargetIds.length > 0} onOpenChange={(open) => !open && closeDeleteConfirmation()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete monitor{deleteTargets.length === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>
              This removes the selected monitor{deleteTargets.length === 1 ? "" : "s"} and related monitoring history immediately. Deleted monitors remain recoverable for 60 seconds.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-md bg-destructive/10 px-4 py-3">
            <p className="text-sm font-medium text-destructive">Are you sure you want to continue?</p>
            <div className="space-y-2 rounded-md bg-background/35 p-3">
              {deleteTargets.slice(0, 5).map((monitor) => (
                <div key={monitor.id} className="py-2">
                  <p className="text-sm font-medium text-foreground">{monitor.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{monitor.url}</p>
                </div>
              ))}
              {deleteTargets.length > 5 ? (
                <p className="text-xs text-muted-foreground">And {deleteTargets.length - 5} more monitors.</p>
              ) : null}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteConfirmation} disabled={saving}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmDeleteSelected()} disabled={saving || deleteTargets.length === 0}>
              {saving ? "Deleting…" : `Delete ${deleteTargets.length === 1 ? "monitor" : `${deleteTargets.length} monitors`}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resetTargetIds.length > 0} onOpenChange={(open) => !open && closeResetConfirmation()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reset monitor history?</DialogTitle>
            <DialogDescription>
              This makes the selected monitor{resetTargets.length === 1 ? "" : "s"} start with fresh health and report data. Monitor settings, targets, companies, notifications, templates, active state, and pause state will not change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-md bg-destructive/10 px-4 py-3">
            <p className="text-sm font-medium text-destructive">History removal cannot be undone.</p>
            <div className="divide-y divide-border/70">
              {resetTargets.slice(0, 5).map((monitor) => (
                <div key={monitor.id} className="py-2 first:pt-0 last:pb-0">
                  <p className="text-sm font-medium text-foreground">{monitor.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{monitor.url}</p>
                </div>
              ))}
              {resetTargets.length > 5 ? (
                <p className="pt-2 text-xs text-muted-foreground">And {resetTargets.length - 5} more monitors.</p>
              ) : null}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
          <DialogFooter className="flex-col">
            <Button variant="outline" onClick={closeResetConfirmation} disabled={saving}>Cancel</Button>
            <Button variant="destructive" onClick={() => void confirmResetSelected()} disabled={saving || resetTargets.length === 0}>
              {saving ? "Resetting…" : `Reset ${resetTargets.length === 1 ? "monitor" : `${resetTargets.length} monitors`}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MonitorHistoryDialog
        open={Boolean(timelineMonitor)}
        monitor={timelineMonitor}
        points={timelineMonitor ? historyByMonitor[timelineMonitor.id] ?? [] : []}
        diagnostics={timelineMonitor ? diagnosticsByMonitor[timelineMonitor.id] ?? [] : []}
        outageEvents={timelineMonitor ? outageEventsByMonitor[timelineMonitor.id] ?? [] : []}
        selectedPointId={selectedTimelinePointId}
        onSelectPoint={setSelectedTimelinePointId}
        onOpenChange={(open) => {
          if (!open) {
            setTimelineMonitor(null);
            setSelectedTimelinePointId(null);
          }
        }}
      />

      <MonitorImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(imported) => {
          importMonitors(imported);
          clearError();
          void loadMonitorPage();
        }}
      />
      {textImportOpen ? (
        <MonitorTextImportDialog
          open
          onOpenChange={setTextImportOpen}
          initialDefaults={defaultForm}
          companies={companies}
          onImported={(imported) => {
            importMonitors(imported);
            clearError();
            void loadMonitorPage();
          }}
        />
      ) : null}
      <MonitorConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        onImported={() => {
          clearError();
          void loadMonitorPage();
        }}
      />
      <MonitorTagsDialog
        open={tagPatchOpen}
        onOpenChange={setTagPatchOpen}
        selectedCount={selectedIds.size}
        onApply={async ({ action, tags }) => {
          const ids = Array.from(selectedIds);
          setTagPatchOpen(false);
          await runBulkAction(
            `${formatTagAction(action)} on ${ids.length} monitor${ids.length === 1 ? "" : "s"}`,
            `Applying tags: ${tags.join(", ")}.`,
            ids.length,
            async () => {
              const response = await fetch("/api/monitors/tags", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids, action, tags }),
              });
              const data = await readJsonOrNull<{ message?: string }>(response);
              if (!response.ok) {
                throw new Error(data?.message ?? "Unable to update monitor tags.");
              }

              await loadMonitorPage();
              setSelectedIds((current) => removeIds(current, ids));
              showToast("Monitor tags updated.", "success");
            }
          );
        }}
      />

      <Dialog open={Boolean(bulkProgress)} onOpenChange={() => undefined}>
        <DialogContent showCloseButton={false} className="sm:max-w-md" aria-busy="true">
          <DialogHeader className="pr-0">
            <DialogTitle>{bulkProgress?.title}</DialogTitle>
            <DialogDescription>
              {bulkProgress?.detail} Keep this page open until the operation finishes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3" role="status" aria-live="polite">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Bulk monitor operation in progress"
              aria-valuetext={`Processing ${bulkProgress?.count ?? 0} monitors`}
            >
              <div className="h-full w-1/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
            </div>
            <p className="text-xs tabular-nums text-muted-foreground">
              Processing {bulkProgress?.count ?? 0} monitor{bulkProgress?.count === 1 ? "" : "s"}…
            </p>
          </div>
        </DialogContent>
      </Dialog>
      {exportOpen ? (
      <MonitorExportDialog
          open
          onOpenChange={setExportOpen}
          selectedIds={Array.from(selectedIds)}
          filteredCount={pagination.totalItems}
          filters={{ search, companyId: companyFilter === "all" ? undefined : companyFilter, status: statusFilter === "all" ? undefined : statusFilter, sort, direction }}
        />
      ) : null}
    </div>
  );
}

function buildVisiblePages(currentPage: number, totalPages: number, windowSize: number) {
  const half = Math.floor(windowSize / 2);
  const start = Math.max(1, Math.min(currentPage - half, totalPages - windowSize + 1));
  const end = Math.min(totalPages, start + windowSize - 1);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

async function readJsonOrNull<T>(response: Response) {
  return (await response.json().catch(() => null)) as T | null;
}

function removeIds(current: Set<string>, ids: string[]) {
  const removed = new Set(ids);
  return new Set(Array.from(current).filter((id) => !removed.has(id)));
}

function omitRecordKeys<T>(current: Record<string, T>, ids: string[]) {
  const omittedIds = new Set(ids);
  return Object.fromEntries(Object.entries(current).filter(([id]) => !omittedIds.has(id)));
}

function formatTagAction(action: "add" | "remove" | "replace") {
  if (action === "add") return "Tag addition";
  if (action === "remove") return "Tag removal";
  return "Tag replacement";
}
