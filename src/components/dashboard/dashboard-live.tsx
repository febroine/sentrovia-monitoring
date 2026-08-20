"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { SystemStatus } from "@/components/system-status";
import { DashboardCustomizationPanel } from "@/components/dashboard/dashboard-customization-panel";
import { DashboardMonitorFocus } from "@/components/dashboard/dashboard-monitor-focus";
import { SystemHealthCard } from "@/components/dashboard/system-health-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_DASHBOARD_PREFERENCES, type DashboardPreferences, type DashboardWidgetId } from "@/lib/dashboard/preferences";
import type { DashboardData } from "@/lib/dashboard/service";

export function DashboardLive({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [companyPage, setCompanyPage] = useState(1);
  const [eventPage, setEventPage] = useState(1);
  const [customizationOpen, setCustomizationOpen] = useState(false);
  const [draftPreferences, setDraftPreferences] = useState<DashboardPreferences>(initialData.preferences);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [customizationError, setCustomizationError] = useState<string | null>(null);
  const [flagPendingId, setFlagPendingId] = useState<string | null>(null);

  useEffect(() => {
    const stream = new EventSource("/api/dashboard/stream");

    stream.onmessage = (event) => {
      try {
        setData(JSON.parse(event.data) as DashboardData);
        setStreamError(null);
      } catch {
        setStreamError("Live dashboard updates could not be parsed.");
      }
    };

    stream.onerror = () => {
      setStreamError("Live dashboard stream disconnected. Cards will reconnect automatically.");
    };

    return () => stream.close();
  }, []);

  useEffect(() => {
    if (!customizationOpen) {
      setDraftPreferences(data.preferences);
    }
  }, [customizationOpen, data.preferences]);

  async function savePreferences() {
    setSavingPreferences(true);
    setCustomizationError(null);
    try {
      const response = await fetch("/api/dashboard/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftPreferences),
      });
      const body = (await response.json()) as { dashboard?: DashboardData; message?: string };
      if (!response.ok || !body.dashboard) {
        throw new Error(body.message ?? "Unable to save dashboard preferences.");
      }

      setData(body.dashboard);
      setCustomizationOpen(false);
    } catch (error) {
      setCustomizationError(error instanceof Error ? error.message : "Unable to save dashboard preferences.");
    } finally {
      setSavingPreferences(false);
    }
  }

  async function updateMonitorFlag(monitorId: string, field: "isFavorite" | "isCritical", value: boolean) {
    setFlagPendingId(monitorId);
    setCustomizationError(null);
    try {
      const response = await fetch(`/api/monitors/${monitorId}/flags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(body.message ?? "Unable to update monitor dashboard flags.");
      }

      setData((current) => {
        const updatedMonitors = current.monitors.map((monitor) =>
          monitor.id === monitorId ? { ...monitor, [field]: value } : monitor
        );
        return {
          ...current,
          monitors: sortFocusMonitors(updatedMonitors, current.preferences.focus),
        };
      });
    } catch (error) {
      setCustomizationError(error instanceof Error ? error.message : "Unable to update monitor dashboard flags.");
    } finally {
      setFlagPendingId(null);
    }
  }

  const cards = useMemo(
    () => [
      {
        label: "Total monitors",
        value: String(data.summary.total),
        sub: `${data.summary.active} active / ${data.summary.paused} paused`,
        tone: "text-slate-700 dark:text-slate-100",
      },
      {
        label: "Online",
        value: String(data.summary.online),
        sub: "Healthy endpoints",
        tone: "text-emerald-600 dark:text-emerald-400",
      },
      {
        label: "Offline",
        value: String(data.summary.offline),
        sub: "Need attention",
        tone: "text-destructive",
      },
      {
        label: "Average latency",
        value: `${data.summary.avgLatency}ms`,
        sub: `${data.summary.coverage.toFixed(1)}% coverage`,
        tone: "text-amber-600 dark:text-amber-400",
      },
    ],
    [data]
  );

  const companyPages = Math.max(1, Math.ceil(data.companyHealth.length / 4));
  const eventPages = Math.max(1, Math.ceil(data.events.length / 5));
  const currentCompanyPage = Math.min(companyPage, companyPages);
  const currentEventPage = Math.min(eventPage, eventPages);
  const companyItems = paginate(data.companyHealth, currentCompanyPage, 4);
  const eventItems = paginate(data.events, currentEventPage, 5);
  const showChartsSection = data.settings?.appearance.showChartsSection ?? true;
  const showOutageBanner = data.settings?.appearance.showOutageBanner ?? true;
  const use24HourClock = data.settings?.appearance.use24HourClock ?? true;
  const isAdmin = data.settings?.profile.role === "admin";
  const preferences = data.preferences ?? DEFAULT_DASHBOARD_PREFERENCES;
  const visibleWidgets = preferences.widgets.filter((widget) => {
    if (!isAdmin && widget === "system") {
      return false;
    }

    return showChartsSection || !["company-health", "recent-events", "delivery"].includes(widget);
  });

  function renderWidget(widget: DashboardWidgetId): ReactNode {
    if (widget === "summary") {
      return (
        <dl className="grid border-y md:grid-cols-2 xl:grid-cols-4 xl:divide-x">
          {cards.map((card) => (
            <div key={card.label} className="border-b px-4 py-4 last:border-b-0 xl:border-b-0">
              <dt className="text-xs font-medium text-muted-foreground">{card.label}</dt>
              <dd className={`mt-2 text-2xl font-semibold tracking-tight ${card.tone}`}>{card.value}</dd>
              <p className="mt-1 text-xs text-muted-foreground">{card.sub}</p>
            </div>
          ))}
        </dl>
      );
    }

    if (widget === "system") {
      return <div className="space-y-4"><SystemHealthCard /><SystemStatus use24HourClock={use24HourClock} /></div>;
    }

    if (widget === "monitor-focus") {
      return <DashboardMonitorFocus monitors={data.monitors} focus={preferences.focus} pendingId={flagPendingId} onFlag={updateMonitorFlag} />;
    }

    if (widget === "company-health") {
      return <PanelCompanyHealth companies={companyItems} page={currentCompanyPage} totalPages={companyPages} onPageChange={setCompanyPage} />;
    }

    if (widget === "recent-events") {
      return <PanelRecentEvents events={eventItems} page={currentEventPage} totalPages={eventPages} onPageChange={setEventPage} use24HourClock={use24HourClock} />;
    }

    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Notification delivery</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid border-y sm:grid-cols-2 lg:grid-cols-5 lg:divide-x">
          <MetricCard label="Delivered" value={String(data.delivery.delivered)} sub="Successful recent deliveries" tone="green" />
          <MetricCard label="Retry Queue" value={String(data.delivery.pendingRetries)} sub="Delivery items waiting for retry" tone="amber" />
          <MetricCard label="Failed" value={String(data.delivery.failed)} sub="Review failed attempts" tone="rose" />
          <MetricCard label="Retrying" value={String(data.delivery.retrying)} sub="Pending the next attempt" tone="neutral" />
          <MetricCard label="Dead-lettered" value={String(data.delivery.deadLettered)} sub="Exhausted or permanent failures" tone="rose" />
          </dl>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <span className="flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400"><span className="size-1.5 bg-sky-500" />Live</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setCustomizationError(null); setCustomizationOpen((open) => !open); }}>
            <SlidersHorizontal className="h-4 w-4" />
            Customize
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Current monitor status, notification delivery, and worker health.
        </p>
      </header>

      {customizationOpen ? (
        <DashboardCustomizationPanel
          preferences={draftPreferences}
          companyOptions={data.companyOptions}
          isAdmin={isAdmin}
          saving={savingPreferences}
          onChange={setDraftPreferences}
          onSave={savePreferences}
          onClose={() => { setCustomizationError(null); setCustomizationOpen(false); }}
        />
      ) : null}

      {customizationError ? (
        <div className="border-l-2 border-destructive px-4 py-2 text-sm text-destructive">
          {customizationError}
        </div>
      ) : null}

      {streamError ? (
        <div className="border-l-2 border-amber-500 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
          {streamError}
        </div>
      ) : null}

      {data.warnings.length > 0 ? (
        <div className="border-l-2 border-amber-500 px-4 py-2 text-sm text-amber-700 dark:text-amber-300">
          Some dashboard data is temporarily unavailable: {data.warnings.join(", ")}. Review the server log and database migration status.
        </div>
      ) : null}

      {showOutageBanner && data.summary.offline > 0 ? (
        <div className="border-l-2 border-destructive bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {data.summary.offline} monitor currently offline. Verification and delivery history are available below.
        </div>
      ) : null}

      <div className="space-y-4">
        {visibleWidgets.map((widget) => <div key={widget}>{renderWidget(widget)}</div>)}
      </div>
    </div>
  );
}

function PanelCompanyHealth({
  companies,
  page,
  totalPages,
  onPageChange,
}: {
  companies: DashboardData["companyHealth"];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm">Company health</CardTitle>
          <PanelPager page={page} totalPages={totalPages} onPageChange={onPageChange} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No monitor groups yet.</p>
        ) : (
          companies.map((company) => (
            <div key={company.id} className="space-y-2 border-b py-3 last:border-b-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{company.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {company.active} active / {company.paused} paused
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
                  {company.up > 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {company.up} up
                    </span>
                  ) : null}
                  {company.down > 0 ? (
                    <span className="text-destructive">
                      {company.down} down
                    </span>
                  ) : null}
                  {company.pending > 0 ? <span className="text-muted-foreground">{company.pending} pending</span> : null}
                  {company.paused > 0 ? <span className="text-muted-foreground">{company.paused} paused</span> : null}
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${company.active > 0 ? (company.up / company.active) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function PanelRecentEvents({
  events,
  page,
  totalPages,
  onPageChange,
  use24HourClock,
}: {
  events: DashboardData["events"];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  use24HourClock: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm">Recent events</CardTitle>
          <PanelPager page={page} totalPages={totalPages} onPageChange={onPageChange} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No monitor events recorded yet.</p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="flex flex-col gap-2 border-b py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-2">
                {event.eventType === "failure" ? (
                  <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
                ) : event.eventType === "recovery" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 text-amber-500" />
                )}
                <div>
                  <p className="text-sm font-medium leading-5">{event.message || event.eventType}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {event.statusCode !== null ? `HTTP ${event.statusCode}` : "No status code"}
                    {event.latencyMs !== null ? ` / ${event.latencyMs}ms` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock3 className="h-3 w-3" />
                {new Date(event.createdAt).toLocaleString([], { hour12: !use24HourClock })}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function PanelPager({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="icon-sm" onClick={() => onPageChange(page - 1)} disabled={page === 1}>
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <span className="min-w-14 text-center text-[11px] text-muted-foreground">
        {page} / {totalPages}
      </span>
      <Button variant="outline" size="icon-sm" onClick={() => onPageChange(page + 1)} disabled={page === totalPages}>
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "green" | "amber" | "neutral" | "rose";
}) {
  const valueTone =
    tone === "green"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "rose"
          ? "text-destructive"
          : "";

  return (
    <div className="border-b px-3 py-3 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 lg:border-b-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={`mt-2 text-xl font-semibold tracking-tight ${valueTone}`}>{value}</dd>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function sortFocusMonitors(monitors: DashboardData["monitors"], focus: DashboardPreferences["focus"]) {
  const filtered = focus === "favorites"
    ? monitors.filter((monitor) => monitor.isFavorite)
    : focus === "critical"
      ? monitors.filter((monitor) => monitor.isCritical)
      : monitors;

  return [...filtered].sort((left, right) => {
    if (left.isCritical !== right.isCritical) return left.isCritical ? -1 : 1;
    if (left.isFavorite !== right.isFavorite) return left.isFavorite ? -1 : 1;
    const statusRank = (status: string) => status === "down" ? 0 : status === "pending" ? 1 : 2;
    const statusDifference = statusRank(left.status) - statusRank(right.status);
    return statusDifference !== 0 ? statusDifference : left.name.localeCompare(right.name);
  });
}
