"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Search, Trash2 } from "lucide-react";
import { LogsFiltersPanel, type LogsFilterOptions } from "@/components/logs/logs-filters-panel";
import { LogsTable } from "@/components/logs/logs-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildCsv, EXPORT_PRESETS } from "@/lib/logs/presets";
import type { LogFilters, LogPresetRecord, LogRecord } from "@/lib/logs/types";

const DEFAULT_FILTERS: LogFilters = {
  search: "",
  level: "all",
  companyQuery: "",
  monitorQuery: "",
  from: "",
  to: "",
  statusCode: "",
};

const AUTO_REFRESH_MS = 15000;

export default function LogsPage() {
  const [filters, setFilters] = useState<LogFilters>(DEFAULT_FILTERS);
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [options, setOptions] = useState<LogsFilterOptions>({ companies: [], monitors: [] });
  const [presets, setPresets] = useState<LogPresetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const [presetName, setPresetName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("placeholder");
  const [exportPreset, setExportPreset] =
    useState<(typeof EXPORT_PRESETS)[number]["id"]>("csv-filtered");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const previousIdsRef = useRef<string[]>([]);

  const loadPresets = useCallback(async () => {
    const response = await fetch("/api/logs/presets", { cache: "no-store" });
    const data = (await response.json()) as { presets?: LogPresetRecord[] };
    setPresets(data.presets ?? []);
  }, []);

  const loadLogs = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value !== "all") {
          params.set(key, value);
        }
      });
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const response = await fetch(`/api/logs?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as {
        message?: string;
        logs?: LogRecord[];
        filters?: LogsFilterOptions;
        pagination?: { total: number; page: number; pageSize: number };
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Unable to load logs.");
      }

      const nextLogs = data.logs ?? [];
      const previousIds = new Set(previousIdsRef.current);
      const incomingIds = nextLogs.map((log) => log.id);
      const newIds = incomingIds.filter((id) => !previousIds.has(id));

      previousIdsRef.current = incomingIds;
      setLogs(nextLogs);
      setOptions(data.filters ?? { companies: [], monitors: [] });
      setTotal(data.pagination?.total ?? 0);
      setError(null);

      if (newIds.length > 0 && silent) {
        setHighlightIds(new Set(newIds));
        window.setTimeout(() => setHighlightIds(new Set()), 4000);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to load logs.");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    void Promise.all([loadLogs(), loadPresets()]);
  }, [loadLogs, loadPresets]);

  useEffect(() => {
    const intervalId = window.setInterval(() => void loadLogs(true), AUTO_REFRESH_MS);
    return () => window.clearInterval(intervalId);
  }, [loadLogs]);

  async function clearAllLogs() {
    const response = await fetch("/api/logs", { method: "DELETE" });
    const data = (await response.json()) as { message?: string };

    if (!response.ok) {
      setError(data.message ?? "Unable to clear logs.");
      return;
    }

    setSelectedIds(new Set());
    await loadLogs();
  }

  async function savePreset() {
    if (!presetName.trim()) {
      return;
    }

    const response = await fetch("/api/logs/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: presetName, filters }),
    });
    const data = (await response.json()) as { presets?: LogPresetRecord[]; message?: string };
    if (!response.ok) {
      setError(data.message ?? "Unable to save the preset.");
      return;
    }

    setPresets(data.presets ?? []);
    setPresetName("");
  }

  async function removePreset(presetId: string) {
    const response = await fetch(`/api/logs/presets?id=${presetId}`, { method: "DELETE" });
    const data = (await response.json()) as { presets?: LogPresetRecord[]; message?: string };
    if (!response.ok) {
      setError(data.message ?? "Unable to delete the preset.");
      return;
    }

    setPresets(data.presets ?? []);
    if (selectedPresetId === presetId) {
      setSelectedPresetId("placeholder");
    }
  }

  function applyPreset(presetId: string) {
    const preset = presets.find((item) => item.id === presetId);
    if (!preset) {
      return;
    }

    setFilters(preset.filters);
    setSelectedPresetId(presetId);
    setPage(1);
  }

  function updateFilter<K extends keyof LogFilters>(key: K, value: LogFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }

  function toggleSelect(id: string) {
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

  function toggleVisibleSelection(ids: string[]) {
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    setSelectedIds((current) => {
      if (allSelected) {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      }

      return new Set([...current, ...ids]);
    });
  }

  function exportLogs(preset: (typeof EXPORT_PRESETS)[number]["id"]) {
    const rows = preset.endsWith("selected") ? logs.filter((log) => selectedIds.has(log.id)) : logs;
    if (rows.length === 0) {
      return;
    }

    const payload = preset.startsWith("json") ? JSON.stringify(rows, null, 2) : buildCsv(rows);
    const blob = new Blob([payload], {
      type: preset.startsWith("json") ? "application/json;charset=utf-8" : "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${preset.replaceAll("-", "_")}.${preset.startsWith("json") ? "json" : "csv"}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Event Logs</h1>
          <p className="text-sm text-muted-foreground">
            Review worker output with server-side pagination, DB-backed saved filters, and live refresh.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={exportPreset}
            onValueChange={(value) => setExportPreset(value as (typeof EXPORT_PRESETS)[number]["id"])}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Export preset" />
            </SelectTrigger>
            <SelectContent>
              {EXPORT_PRESETS.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => exportLogs(exportPreset)}
            disabled={exportPreset.endsWith("selected") ? selectedIds.size === 0 : logs.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" onClick={() => void loadLogs()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="destructive" onClick={() => void clearAllLogs()} disabled={total === 0}>
            <Trash2 className="mr-2 h-4 w-4" />
            Clear all
          </Button>
        </div>
      </header>

      {error ? <AlertBanner message={error} /> : null}

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(event) => updateFilter("search", event.target.value)}
          placeholder="Search messages, companies, monitors, RCA summaries, or status context"
          className="h-11 pl-9"
        />
      </div>

      <LogsFiltersPanel
        filters={filters}
        filtersOpen={filtersOpen}
        presets={presets}
        presetName={presetName}
        selectedPresetId={selectedPresetId}
        options={options}
        onToggleOpen={() => setFiltersOpen((current) => !current)}
        onUpdateFilter={updateFilter}
        onResetFilters={resetFilters}
        onSavePresetName={setPresetName}
        onApplyPreset={applyPreset}
        onRemovePreset={removePreset}
        onSavePreset={() => void savePreset()}
      />

      {selectedIds.size > 0 ? (
        <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/10 px-4 py-3">
          <div>
            <p className="text-sm font-medium">{selectedIds.size} log selected</p>
            <p className="text-xs text-muted-foreground">
              Selection stays local so you can export only the rows you need.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </Button>
        </div>
      ) : null}

      <LogsTable
        logs={logs}
        total={total}
        loading={loading}
        selectedIds={selectedIds}
        highlightIds={highlightIds}
        page={page}
        pageSize={pageSize}
        onToggleSelect={toggleSelect}
        onToggleAll={toggleVisibleSelection}
        onPageChange={setPage}
        onPageSizeChange={(value) => {
          setPageSize(value);
          setPage(1);
        }}
      />
    </div>
  );
}

function AlertBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}
