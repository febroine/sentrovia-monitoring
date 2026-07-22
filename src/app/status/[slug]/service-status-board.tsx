"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Globe2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime, type TimeDisplaySettings } from "@/lib/time";
import { cn } from "@/lib/utils";

type ServiceStatus = "up" | "pending" | "down";
type StatusFilter = "all" | ServiceStatus;

type PublicStatusService = {
  id: string;
  url: string;
  company: string;
  status: string;
  uptime: string;
  latencyMs: number | null;
  slowResponseThresholdMs: number | null;
  lastCheckedAt: string | null;
  healthScore: number;
  healthLabel: string;
  hasOpenOutage: boolean;
  outageStartedAt: string | null;
};

export function ServiceStatusBoard({
  services,
  timeDisplaySettings,
}: {
  services: PublicStatusService[];
  timeDisplaySettings: TimeDisplaySettings;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const filteredServices = useMemo(
    () => filterPublicStatusServices(services, query, statusFilter),
    [query, services, statusFilter]
  );

  return (
    <section className="overflow-hidden rounded-md border border-border bg-card/40">
      <ServiceBoardHeader
        query={query}
        resultCount={filteredServices.length}
        services={services}
        setQuery={setQuery}
        setStatusFilter={setStatusFilter}
        statusFilter={statusFilter}
      />

      {filteredServices.length > 0 ? (
        <div className="grid gap-3 p-3 xl:grid-cols-2">
          {filteredServices.map((service) => (
            <ServicePanel
              key={service.id}
              service={service}
              status={normalizeServiceStatus(service.status)}
              timeDisplaySettings={timeDisplaySettings}
            />
          ))}
        </div>
      ) : (
        <EmptyServiceState
          filtered={services.length > 0}
          onClear={() => {
            setQuery("");
            setStatusFilter("all");
          }}
        />
      )}
    </section>
  );
}

function ServiceBoardHeader({
  query,
  resultCount,
  services,
  setQuery,
  setStatusFilter,
  statusFilter,
}: {
  query: string;
  resultCount: number;
  services: PublicStatusService[];
  setQuery: (value: string) => void;
  setStatusFilter: (value: StatusFilter) => void;
  statusFilter: StatusFilter;
}) {
  const filters = buildStatusFilters(services);

  return (
    <div className="space-y-4 border-b border-border px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Service status</h2>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            Showing {resultCount} of {services.length} published services
          </p>
        </div>
        <div className="relative w-full lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search published services"
            className="pl-9 pr-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search URL or company"
            value={query}
          />
          {query ? (
            <button
              aria-label="Clear service search"
              className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setQuery("")}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-md border border-border bg-background/65 p-1">
        {filters.map((filter) => (
          <button
            aria-pressed={statusFilter === filter.value}
            className={cn(
              "flex h-9 shrink-0 items-center gap-2 rounded-sm px-3 text-sm font-medium transition-colors",
              statusFilter === filter.value
                ? filter.activeClass
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            key={filter.value}
            onClick={() => setStatusFilter(filter.value)}
            type="button"
          >
            {filter.label}
            <span className="tabular-nums opacity-75">{filter.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ServicePanel({
  service,
  status,
  timeDisplaySettings,
}: {
  service: PublicStatusService;
  status: ServiceStatus;
  timeDisplaySettings: TimeDisplaySettings;
}) {
  const meta = getStatusMeta(status);
  const StatusIcon = meta.icon;
  const checkedAt = formatStatusDate(service.lastCheckedAt, timeDisplaySettings, "Not checked yet");
  const outageStartedAt = formatStatusDate(service.outageStartedAt, timeDisplaySettings, "None");

  return (
    <article className={cn("flex min-h-56 flex-col rounded-md border border-l-8", meta.panel)}>
      <div className="flex flex-1 flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Globe2 className="h-4 w-4 shrink-0" />
            {service.company}
          </p>
          <h3 className={cn("mt-3 break-all text-xl font-semibold leading-8 sm:text-2xl", meta.url)}>
            {service.url}
          </h3>
          <p className="mt-3 text-sm text-muted-foreground">Last checked {checkedAt}</p>
        </div>

        <div className={cn("flex min-w-36 shrink-0 items-center justify-center gap-2 rounded-md border px-4 py-3 text-base font-semibold", meta.status)}>
          <StatusIcon className="h-5 w-5" />
          {meta.label}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
        <ServiceDetail label="Health" value={`${service.healthScore} / ${service.healthLabel}`} />
        <ServiceDetail label="Uptime" value={service.uptime} />
        <ServiceDetail label="Latency" value={formatLatency(service)} />
        <ServiceDetail
          label={service.hasOpenOutage ? "Outage since" : "Outage"}
          tone={service.hasOpenOutage ? "text-rose-600 dark:text-rose-300" : undefined}
          value={service.hasOpenOutage ? outageStartedAt : "None"}
        />
      </div>
    </article>
  );
}

function ServiceDetail({ label, tone, value }: { label: string; tone?: string; value: string }) {
  return (
    <div className="min-w-0 bg-background/55 px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 break-words text-sm font-semibold", tone)}>{value}</p>
    </div>
  );
}

function EmptyServiceState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center px-5 py-16 text-center">
      <p className="text-sm text-muted-foreground">
        {filtered ? "No services match the current filters." : "No active monitors are published for this status page."}
      </p>
      {filtered ? (
        <Button className="mt-4" onClick={onClear} size="sm" variant="outline">
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}

export function filterPublicStatusServices(
  services: PublicStatusService[],
  query: string,
  statusFilter: StatusFilter
) {
  const normalizedQuery = normalizeSearchText(query.trim());

  return services.filter((service) => {
    const status = normalizeServiceStatus(service.status);
    const matchesStatus = statusFilter === "all" || status === statusFilter;
    const matchesQuery = !normalizedQuery
      || normalizeSearchText(service.url).includes(normalizedQuery)
      || normalizeSearchText(service.company).includes(normalizedQuery);
    return matchesStatus && matchesQuery;
  });
}

function normalizeSearchText(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

function buildStatusFilters(services: PublicStatusService[]) {
  const counts = services.reduce(
    (result, service) => {
      result[normalizeServiceStatus(service.status)] += 1;
      return result;
    },
    { up: 0, pending: 0, down: 0 }
  );

  return [
    { value: "all" as const, label: "All", count: services.length, activeClass: "bg-foreground text-background" },
    { value: "down" as const, label: "Outage", count: counts.down, activeClass: "bg-rose-600 text-white" },
    { value: "pending" as const, label: "Degraded", count: counts.pending, activeClass: "bg-amber-500 text-amber-950" },
    { value: "up" as const, label: "Operational", count: counts.up, activeClass: "bg-emerald-600 text-white" },
  ];
}

function getStatusMeta(status: ServiceStatus) {
  if (status === "down") {
    return {
      label: "DOWN",
      icon: AlertTriangle,
      panel: "border-rose-500 bg-rose-50/90 dark:bg-rose-950/30",
      status: "border-rose-500/50 bg-rose-600 text-white dark:bg-rose-500 dark:text-rose-950",
      url: "text-rose-800 dark:text-rose-200",
    };
  }

  if (status === "pending") {
    return {
      label: "DEGRADED",
      icon: Clock3,
      panel: "border-amber-500 bg-amber-50/90 dark:bg-amber-950/30",
      status: "border-amber-500/50 bg-amber-500 text-amber-950",
      url: "text-amber-900 dark:text-amber-100",
    };
  }

  return {
    label: "UP",
    icon: CheckCircle2,
    panel: "border-emerald-500 bg-emerald-50/90 dark:bg-emerald-950/30",
    status: "border-emerald-500/50 bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950",
    url: "text-emerald-800 dark:text-emerald-100",
  };
}

function normalizeServiceStatus(status: string): ServiceStatus {
  if (status === "up" || status === "pending" || status === "down") {
    return status;
  }

  return "pending";
}

function formatLatency(service: PublicStatusService) {
  if (typeof service.latencyMs !== "number") {
    return "--";
  }

  if (typeof service.slowResponseThresholdMs !== "number") {
    return `${service.latencyMs} ms`;
  }

  return `${service.latencyMs} ms / ${service.slowResponseThresholdMs} ms limit`;
}

function formatStatusDate(value: string | null, settings: TimeDisplaySettings, fallback: string) {
  return value ? formatDateTime(value, settings, { includeSeconds: true }) : fallback;
}
