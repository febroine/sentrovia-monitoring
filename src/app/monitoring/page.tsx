"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileCode2,
  FileSpreadsheet,
  Plus,
  Search,
  Tags,
  Trash2,
} from "lucide-react";
import { MonitorConfigDialog } from "@/components/monitoring/monitor-config-dialog";
import { MonitorForm } from "@/components/monitoring/monitor-form";
import { MonitorHistoryDialog } from "@/components/monitoring/monitor-history-dialog";
import { MonitorImportDialog } from "@/components/monitoring/monitor-import-dialog";
import { MonitorStats } from "@/components/monitoring/monitor-stats";
import { MonitorTable } from "@/components/monitoring/monitor-table";
import { MonitorTagsDialog } from "@/components/monitoring/monitor-tags-dialog";
import { WorkerPulseCard } from "@/components/monitoring/worker-pulse-card";
import { payloadFromMonitor } from "@/components/monitoring/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CompanyRecord } from "@/lib/companies/types";
import { buildDefaultMonitorForm } from "@/lib/monitors/defaults";
import {
  DEFAULT_MONITOR_FORM,
  type MonitorHistoryPoint,
  type MonitorPayload,
  type MonitorRecord,
} from "@/lib/monitors/types";
import type { SettingsPayload } from "@/lib/settings/types";
import { useMonitoringStore } from "@/stores/use-monitoring-store";

const PAGE_SIZE_OPTIONS = [10, 50, 100] as const;
const PAGE_NUMBER_WINDOW = 5;

export default function MonitoringPage() {
  const {
    monitors,
    loading,
    saving,
    error,
    loadMonitors,
    createMonitor,
    updateMonitor,
    bulkUpdateMonitors,
    deleteMonitors,
    importMonitors,
    clearError,
  } = useMonitoringStore();
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [editingMonitor, setEditingMonitor] = useState<MonitorRecord | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [tagPatchOpen, setTagPatchOpen] = useState(false);
  const [companies, setCompanies] = useState<CompanyRecord[]>([]);
  const [savedEmails, setSavedEmails] = useState<string[]>([]);
  const [defaultForm, setDefaultForm] = useState(DEFAULT_MONITOR_FORM);
  const [historyByMonitor, setHistoryByMonitor] = useState<Record<string, MonitorHistoryPoint[]>>({});
  const [timelineMonitor, setTimelineMonitor] = useState<MonitorRecord | null>(null);
  const [selectedTimelinePointId, setSelectedTimelinePointId] = useState<string | null>(null);

  const companyFilters = useMemo(
    () => ["all", ...Array.from(new Set(monitors.map((monitor) => monitor.company).filter(Boolean)))],
    [monitors]
  );

  const filtered = useMemo(
    () =>
      monitors.filter((monitor) => {
        const query = search.trim().toLowerCase();
        const matchesSearch =
          !query ||
          monitor.name.toLowerCase().includes(query) ||
          monitor.url.toLowerCase().includes(query) ||
          monitor.tags.some((tag) => tag.toLowerCase().includes(query));
        const matchesCompany = companyFilter === "all" || monitor.company === companyFilter;
        return matchesSearch && matchesCompany;
      }),
    [companyFilter, monitors, search]
  );
  const problematicCount = useMemo(
    () => monitors.filter((monitor) => monitor.status === "down" || monitor.verificationMode).length,
    [monitors]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visiblePages = buildVisiblePages(currentPage, totalPages, PAGE_NUMBER_WINDOW);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const allPageSelected = paginated.length > 0 && paginated.every((monitor) => selectedIds.has(monitor.id));
  const somePageSelected = paginated.some((monitor) => selectedIds.has(monitor.id));
  const bulkEditTemplate = useMemo(() => {
    const firstSelected = monitors.find((monitor) => selectedIds.has(monitor.id));
    return firstSelected ? payloadFromMonitor(firstSelected) : defaultForm;
  }, [defaultForm, monitors, selectedIds]);

  const loadSupportingData = useCallback(async () => {
    const [companiesResponse, settingsResponse] = await Promise.all([
      fetch("/api/companies", { cache: "no-store" }),
      fetch("/api/settings", { cache: "no-store" }),
    ]);
    const companiesData = (await companiesResponse.json()) as { companies?: CompanyRecord[] };
    const settingsData = (await settingsResponse.json()) as { settings?: SettingsPayload | null };

    setCompanies(companiesData.companies ?? []);
    setSavedEmails(settingsData.settings?.notifications.savedEmailRecipients ?? []);
    setDefaultForm(buildDefaultMonitorForm(settingsData.settings ?? null));
  }, []);

  const loadMonitorHistory = useCallback(async () => {
    const response = await fetch("/api/monitors/history", { cache: "no-store" });
    const data = (await response.json()) as { history?: Record<string, MonitorHistoryPoint[]> };
    setHistoryByMonitor(data.history ?? {});
  }, []);

  const refreshMonitoring = useCallback(async () => {
    await Promise.all([loadMonitors(), loadMonitorHistory(), loadSupportingData()]);
  }, [loadMonitorHistory, loadMonitors, loadSupportingData]);

  useEffect(() => {
    queueMicrotask(() => {
      void refreshMonitoring();
    });
  }, [refreshMonitoring]);

  useEffect(() => {
    const search = typeof window === "undefined" ? "" : window.location.search;
    const params = new URLSearchParams(search);

    if (params.get("create") !== "1") {
      return;
    }

    const frameId = window.requestAnimationFrame(() => setCreateOpen(true));
    return () => window.cancelAnimationFrame(frameId);
  }, []);

  async function handleCreate(payload: MonitorPayload) {
    const created = await createMonitor(payload);
    if (created) {
      await refreshMonitoring();
      setCreateOpen(false);
    }
  }

  async function handleUpdate(payload: MonitorPayload) {
    if (!editingMonitor) {
      return;
    }

    const updated = await updateMonitor(editingMonitor.id, payload);
    if (updated) {
      await refreshMonitoring();
      setEditingMonitor(null);
    }
  }

  async function handleBulkUpdate(payload: MonitorPayload) {
    const updated = await bulkUpdateMonitors(Array.from(selectedIds), payload);
    if (updated.length > 0) {
      await refreshMonitoring();
      setBulkEditOpen(false);
      setSelectedIds(new Set());
    }
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) {
      return;
    }

    const deletedIds = await deleteMonitors(Array.from(selectedIds));
    if (deletedIds.length > 0) {
      await refreshMonitoring();
      setSelectedIds(new Set());
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

  function handleSelectTimelinePoint(monitor: MonitorRecord, point: MonitorHistoryPoint) {
    setTimelineMonitor(monitor);
    setSelectedTimelinePointId(point.id);
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Monitoring</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} endpoints shown · {problematicCount} problematic
          </p>
        </div>

        <div className="flex flex-wrap gap-2 xl:justify-end">
          <a href="/templates/monitors-template.csv" download className={buttonVariants({ variant: "outline" })}>
            <FileSpreadsheet className="mr-2 size-4" />
            Sample CSV
          </a>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="mr-2 size-4" />
            Import CSV
          </Button>
          <Button variant="outline" onClick={() => setConfigOpen(true)}>
            <FileCode2 className="mr-2 size-4" />
            Monitoring as Code
          </Button>
          <Button variant="outline" onClick={() => void refreshMonitoring()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 size-4" />
            Add Monitor
          </Button>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <WorkerPulseCard />
      <MonitorStats monitors={monitors} />

      <div className="flex flex-col gap-3 sm:flex-row">
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
            {companyFilters.map((company) => (
              <SelectItem key={company} value={company}>
                {company === "all" ? "All companies" : company}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                Show {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedIds.size > 0 ? (
        <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/10 px-4 py-2.5">
          <span className="text-sm font-medium">{selectedIds.size} monitor selected</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setBulkEditOpen(true)}>
              Bulk Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTagPatchOpen(true)}>
              <Tags className="mr-1 size-3.5" />
              Tags
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void handleDeleteSelected()} disabled={saving}>
              <Trash2 className="mr-1 size-3.5" />
              Delete selected
            </Button>
          </div>
        </div>
      ) : null}

      <MonitorTable
        monitors={paginated}
        loading={loading}
        historyByMonitor={historyByMonitor}
        selectedIds={selectedIds}
        allPageSelected={allPageSelected}
        somePageSelected={somePageSelected}
        onToggleAll={toggleAll}
        onToggleOne={toggleOne}
        onEdit={setEditingMonitor}
        onSelectTimelinePoint={handleSelectTimelinePoint}
      />

      {totalPages > 1 ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/10 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-muted-foreground">Page {currentPage} of {totalPages} · {pageSize} rows</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create monitor</DialogTitle>
            <DialogDescription>Store a site URL and all monitoring settings in PostgreSQL.</DialogDescription>
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
            <DialogDescription>Update the stored site URL, checks, alerts, and templates.</DialogDescription>
          </DialogHeader>
          {editingMonitor ? (
            <MonitorForm
              initialValue={payloadFromMonitor(editingMonitor)}
              companies={companies}
              savedEmails={savedEmails}
              submitting={saving}
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
            <DialogDescription>Apply the same monitor configuration to all selected sites.</DialogDescription>
          </DialogHeader>
          {selectedIds.size > 0 ? (
            <MonitorForm
              initialValue={bulkEditTemplate}
              companies={companies}
              savedEmails={savedEmails}
              submitting={saving}
              submitLabel="Apply to selected monitors"
              onCancel={() => setBulkEditOpen(false)}
              onSubmit={handleBulkUpdate}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <MonitorHistoryDialog
        open={Boolean(timelineMonitor && selectedTimelinePointId)}
        monitor={timelineMonitor}
        points={timelineMonitor ? historyByMonitor[timelineMonitor.id] ?? [] : []}
        selectedPointId={selectedTimelinePointId}
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
          void refreshMonitoring();
        }}
      />
      <MonitorConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        onImported={() => {
          clearError();
          void refreshMonitoring();
        }}
      />
      <MonitorTagsDialog
        open={tagPatchOpen}
        onOpenChange={setTagPatchOpen}
        selectedCount={selectedIds.size}
        onApply={async ({ action, tags }) => {
          await fetch("/api/monitors/tags", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: Array.from(selectedIds), action, tags }),
          });
          await refreshMonitoring();
        }}
      />
    </div>
  );
}

function buildVisiblePages(currentPage: number, totalPages: number, windowSize: number) {
  const half = Math.floor(windowSize / 2);
  const start = Math.max(1, Math.min(currentPage - half, totalPages - windowSize + 1));
  const end = Math.min(totalPages, start + windowSize - 1);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

