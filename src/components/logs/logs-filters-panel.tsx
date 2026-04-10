"use client";

import { CalendarClock, ChevronDown, ChevronUp, Save, SlidersHorizontal, X } from "lucide-react";
import { DateField, SuggestionField } from "@/components/logs/log-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LogFilters, LogPresetRecord } from "@/lib/logs/types";

export interface LogsFilterOptions {
  companies: Array<{ id: string; name: string }>;
  monitors: Array<{ id: string; name: string; companyId: string | null }>;
}

const QUICK_DATE_PRESETS = [
  { id: "today", label: "Today", days: 0 },
  { id: "24h", label: "Last 24h", days: 1 },
  { id: "7d", label: "Last 7d", days: 7 },
] as const;

export function LogsFiltersPanel({
  filters,
  filtersOpen,
  presets,
  presetName,
  selectedPresetId,
  options,
  onToggleOpen,
  onUpdateFilter,
  onResetFilters,
  onSavePresetName,
  onApplyPreset,
  onRemovePreset,
  onSavePreset,
}: {
  filters: LogFilters;
  filtersOpen: boolean;
  presets: LogPresetRecord[];
  presetName: string;
  selectedPresetId: string;
  options: LogsFilterOptions;
  onToggleOpen: () => void;
  onUpdateFilter: <K extends keyof LogFilters>(key: K, value: LogFilters[K]) => void;
  onResetFilters: () => void;
  onSavePresetName: (value: string) => void;
  onApplyPreset: (presetId: string) => void;
  onRemovePreset: (presetId: string) => void;
  onSavePreset: () => void;
}) {
  const companySuggestions = options.companies
    .filter((company) => matchesQuery(company.name, filters.companyQuery))
    .slice(0, 8);

  const activeCompanyIds = getActiveCompanyIds(filters.companyQuery, options.companies);
  const monitorSuggestions = options.monitors
    .filter((monitor) => belongsToActiveCompany(monitor.companyId, activeCompanyIds))
    .filter((monitor) => matchesQuery(monitor.name, filters.monitorQuery))
    .slice(0, 8);

  const matchedCompany = getMatchedCompany(filters.companyQuery, options.companies);
  const scopedMonitors = options.monitors.filter((monitor) =>
    belongsToActiveCompany(monitor.companyId, activeCompanyIds)
  );
  const activeFilterChips = buildActiveFilterChips(filters);

  return (
    <Card className="border-border/80">
      <CardHeader className={`${filtersOpen ? "border-b" : ""} bg-muted/10 pb-4`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <SlidersHorizontal className="h-4 w-4 text-sky-500" />
                Filters
              </CardTitle>
              <CardDescription>
                Narrow the stream with company, monitor, severity, status code, and date controls.
              </CardDescription>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <FilterMiniStat
                label="Active filters"
                value={String(activeFilterChips.length)}
                helper={activeFilterChips.length > 0 ? "Custom scope applied" : "Showing the full stream"}
                accent="before:bg-sky-500"
              />
              <FilterMiniStat
                label="Saved views"
                value={String(presets.length)}
                helper={presets.length > 0 ? "Reusable DB-backed presets" : "Save a preset after filtering"}
                accent="before:bg-violet-500"
              />
              <FilterMiniStat
                label="Company scope"
                value={matchedCompany?.name ?? "All companies"}
                helper={matchedCompany ? `${scopedMonitors.length} monitors in scope` : "No company narrowed yet"}
                accent="before:bg-emerald-500"
              />
              <FilterMiniStat
                label="Date range"
                value={describeDateRange(filters)}
                helper="Use quick presets or the calendar picker"
                accent="before:bg-amber-500"
              />
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={onToggleOpen}>
            {filtersOpen ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
            {filtersOpen ? "Collapse" : "Expand"}
          </Button>
        </div>
      </CardHeader>

      {filtersOpen ? (
        <CardContent className="space-y-5 pt-5">
          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Saved filters and quick ranges</p>
                <p className="text-xs text-muted-foreground">
                  Save reusable views, jump into common date windows, and clear scope without rebuilding filters.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_DATE_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyQuickDateRange(preset.days, onUpdateFilter)}
                  >
                    <CalendarClock className="mr-2 h-3.5 w-3.5" />
                    {preset.label}
                  </Button>
                ))}
                <Button type="button" variant="ghost" size="sm" onClick={onResetFilters}>
                  Clear all
                </Button>
              </div>
            </div>
            <div className="mt-4">
              <FilterPresetRow
                presetName={presetName}
                presets={presets}
                selectedPresetId={selectedPresetId}
                onPresetNameChange={onSavePresetName}
                onApplyPreset={onApplyPreset}
                onRemovePreset={onRemovePreset}
                onSavePreset={onSavePreset}
              />
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="space-y-4 rounded-xl border border-border/70 bg-background/60 p-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_160px]">
                <Select value={filters.level} onValueChange={(value) => onUpdateFilter("level", String(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All levels</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  inputMode="numeric"
                  value={filters.statusCode}
                  onChange={(event) => onUpdateFilter("statusCode", event.target.value.replace(/\D/g, "").slice(0, 3))}
                  placeholder="Status code"
                />
                <Button variant="outline" onClick={onResetFilters}>
                  Reset filters
                </Button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <SuggestionField
                  label="Company"
                  placeholder="Type a company name"
                  hint="Start typing instead of scrolling through every customer account."
                  value={filters.companyQuery}
                  suggestions={companySuggestions.map((item) => item.name)}
                  onChange={(value) => onUpdateFilter("companyQuery", value)}
                />
                <SuggestionField
                  label="Monitor"
                  placeholder="Type a monitor name"
                  hint="If the company matches exactly, monitor suggestions are narrowed to that account."
                  value={filters.monitorQuery}
                  suggestions={monitorSuggestions.map((item) => item.name)}
                  onChange={(value) => onUpdateFilter("monitorQuery", value)}
                />
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-border/70 bg-muted/15 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Time window</p>
                <p className="text-xs text-muted-foreground">
                  Use quick presets for incident review, then refine the exact range with the calendar fields.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                <DateField label="From date" value={filters.from} onChange={(value) => onUpdateFilter("from", value)} />
                <DateField label="To date" value={filters.to} onChange={(value) => onUpdateFilter("to", value)} />
              </div>
            </div>
          </div>

          <ActiveFiltersRow chips={activeFilterChips} onRemove={(key) => onUpdateFilter(key, getDefaultValue(key))} />
        </CardContent>
      ) : null}
    </Card>
  );
}

function ActiveFiltersRow({
  chips,
  onRemove,
}: {
  chips: Array<{ key: keyof LogFilters; label: string; value: string }>;
  onRemove: (key: keyof LogFilters) => void;
}) {
  if (chips.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/10 px-4 py-3">
        <p className="text-sm font-medium">No active filters</p>
        <p className="text-xs text-muted-foreground">
          Open scope, all levels, and the full event timeline are currently visible.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Active filters</p>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Badge
            key={chip.key}
            variant="outline"
            className="h-auto gap-2 rounded-full border-border/70 bg-background px-3 py-1.5 text-xs font-medium"
          >
            <span>
              {chip.label}: {chip.value}
            </span>
            <button
              type="button"
              onClick={() => onRemove(chip.key)}
              className="text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

function FilterMiniStat({
  label,
  value,
  helper,
  accent,
}: {
  label: string;
  value: string;
  helper: string;
  accent: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-border/70 bg-background/75 px-4 py-3 before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-full ${accent}`}
    >
      <p className="pl-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="pl-3 pt-2 text-sm font-semibold text-foreground">{value}</p>
      <p className="pl-3 pt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function FilterPresetRow({
  presetName,
  presets,
  selectedPresetId,
  onPresetNameChange,
  onApplyPreset,
  onRemovePreset,
  onSavePreset,
}: {
  presetName: string;
  presets: LogPresetRecord[];
  selectedPresetId: string;
  onPresetNameChange: (value: string) => void;
  onApplyPreset: (presetId: string) => void;
  onRemovePreset: (presetId: string) => void;
  onSavePreset: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
        <Input
          value={presetName}
          onChange={(event) => onPresetNameChange(event.target.value)}
          placeholder="Save current filters as..."
        />
        <Select value={selectedPresetId} onValueChange={(value) => onApplyPreset(String(value))}>
          <SelectTrigger>
            <SelectValue placeholder="Saved filters" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="placeholder" disabled>
              Saved filters
            </SelectItem>
            {presets.length === 0 ? (
              <SelectItem value="none" disabled>
                No saved filters yet
              </SelectItem>
            ) : (
              presets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={onSavePreset} disabled={!presetName.trim()}>
          <Save className="mr-2 h-4 w-4" />
          Save filter
        </Button>
      </div>

      {presets.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <div key={preset.id} className="flex items-center gap-1 rounded-full border bg-background px-3 py-1.5">
              <button type="button" onClick={() => onApplyPreset(preset.id)} className="text-xs font-medium">
                {preset.name}
              </button>
              <button
                type="button"
                onClick={() => onRemovePreset(preset.id)}
                className="text-xs text-muted-foreground transition hover:text-foreground"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function matchesQuery(value: string, query: string) {
  return !query.trim() || value.toLowerCase().includes(query.trim().toLowerCase());
}

function belongsToActiveCompany(companyId: string | null, activeCompanyIds: Set<string> | null) {
  if (!activeCompanyIds) {
    return true;
  }

  return companyId ? activeCompanyIds.has(companyId) : false;
}

function getActiveCompanyIds(
  query: string,
  companies: Array<{ id: string; name: string }>
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return null;
  }

  const exactMatches = companies.filter((company) => company.name.toLowerCase() === normalizedQuery);
  return exactMatches.length > 0 ? new Set(exactMatches.map((company) => company.id)) : null;
}

function getMatchedCompany(query: string, companies: Array<{ id: string; name: string }>) {
  const normalizedQuery = query.trim().toLowerCase();
  return companies.find((company) => company.name.toLowerCase() === normalizedQuery) ?? null;
}

function buildActiveFilterChips(filters: LogFilters) {
  return [
    filters.level !== "all" ? { key: "level", label: "Level", value: filters.level } : null,
    filters.statusCode ? { key: "statusCode", label: "Status", value: filters.statusCode } : null,
    filters.companyQuery ? { key: "companyQuery", label: "Company", value: filters.companyQuery } : null,
    filters.monitorQuery ? { key: "monitorQuery", label: "Monitor", value: filters.monitorQuery } : null,
    filters.from ? { key: "from", label: "From", value: filters.from } : null,
    filters.to ? { key: "to", label: "To", value: filters.to } : null,
  ].filter((value): value is { key: keyof LogFilters; label: string; value: string } => Boolean(value));
}

function getDefaultValue(key: keyof LogFilters) {
  if (key === "level") {
    return "all";
  }

  return "";
}

function describeDateRange(filters: LogFilters) {
  if (filters.from && filters.to) {
    return `${filters.from} -> ${filters.to}`;
  }

  if (filters.from) {
    return `From ${filters.from}`;
  }

  if (filters.to) {
    return `Until ${filters.to}`;
  }

  return "All time";
}

function applyQuickDateRange(
  days: number,
  onUpdateFilter: <K extends keyof LogFilters>(key: K, value: LogFilters[K]) => void
) {
  const now = new Date();
  const to = formatDateInput(now);

  if (days === 0) {
    onUpdateFilter("from", to);
    onUpdateFilter("to", to);
    return;
  }

  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - days);
  onUpdateFilter("from", formatDateInput(fromDate));
  onUpdateFilter("to", to);
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}
