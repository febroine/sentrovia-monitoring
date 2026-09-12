"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Activity,
  ArrowRight,
  BellRing,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Gauge,
  ListChecks,
  Radio,
  RefreshCw,
  SlidersHorizontal,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { DashboardCustomizationPanel } from "@/components/dashboard/dashboard-customization-panel";
import { getActivationProgress } from "@/components/dashboard/dashboard-activation";
import { DashboardMonitorFocus } from "@/components/dashboard/dashboard-monitor-focus";
import { SystemHealthCard } from "@/components/dashboard/system-health-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { DEFAULT_DASHBOARD_PREFERENCES, type DashboardPreferences, type DashboardWidgetId } from "@/lib/dashboard/preferences";
import type { DashboardData } from "@/lib/dashboard/service";
import { formatDateTime, resolveTimeDisplaySettings, type TimeDisplaySettings } from "@/lib/time";
import { cn } from "@/lib/utils";

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
  const [outageBannerDismissed, setOutageBannerDismissed] = useState(false);

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
      setStreamError("Live dashboard disconnected. Reconnecting automatically.");
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

  const companyPages = Math.max(1, Math.ceil(data.companyHealth.length / 4));
  const eventPages = Math.max(1, Math.ceil(data.events.length / 5));
  const currentCompanyPage = Math.min(companyPage, companyPages);
  const currentEventPage = Math.min(eventPage, eventPages);
  const companyItems = paginate(data.companyHealth, currentCompanyPage, 4);
  const eventItems = paginate(data.events, currentEventPage, 5);
  const showChartsSection = data.settings?.appearance.showChartsSection ?? true;
  const showOutageBanner = data.settings?.appearance.showOutageBanner ?? true;
  const timeDisplaySettings = resolveTimeDisplaySettings(data.settings?.appearance);
  const isAdmin = data.settings?.profile.role === "admin";
  const preferences = data.preferences ?? DEFAULT_DASHBOARD_PREFERENCES;
  const visibleWidgets = preferences.widgets.filter((widget) => {
    if (!isAdmin && widget === "system") {
      return false;
    }

    return showChartsSection || !["company-health", "recent-events", "delivery"].includes(widget);
  });
  const activationVisible = isAdmin && !data.activation.complete;
  const isEmptyWorkspace = activationVisible && data.summary.total === 0;
  const summaryVisible = visibleWidgets.includes("summary") && !isEmptyWorkspace;
  const detailWidgets = visibleWidgets.filter((widget) =>
    widget !== "summary" && (!isEmptyWorkspace || widget === "system")
  );

  function renderWidget(widget: DashboardWidgetId): ReactNode {
    if (widget === "system") {
      return <SystemHealthCard timeDisplaySettings={timeDisplaySettings} />;
    }

    if (widget === "monitor-focus") {
      return <DashboardMonitorFocus monitors={data.monitors} focus={preferences.focus} pendingId={flagPendingId} onFlag={updateMonitorFlag} />;
    }

    if (widget === "company-health") {
      return <PanelCompanyHealth companies={companyItems} page={currentCompanyPage} totalPages={companyPages} onPageChange={setCompanyPage} />;
    }

    if (widget === "recent-events") {
      return <PanelRecentEvents events={eventItems} page={currentEventPage} totalPages={eventPages} onPageChange={setEventPage} timeDisplaySettings={timeDisplaySettings} />;
    }

    return <PanelDelivery delivery={data.delivery} />;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <span
              role="status"
              aria-live="polite"
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-md bg-muted/30 px-2 py-1 text-[0.7rem] font-medium tracking-wide",
                streamError
                  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  : "bg-primary/10 text-primary",
              )}
            >
              {streamError ? (
                <RefreshCw className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Radio className="size-3.5" aria-hidden="true" />
              )}
              {streamError ? "Reconnecting" : "Live"}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setCustomizationError(null); setCustomizationOpen((open) => !open); }}>
              <SlidersHorizontal data-icon="inline-start" className="h-4 w-4" />
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
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {customizationError}
        </div>
      ) : null}

      {streamError ? (
        <div className="rounded-md bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          {streamError}
        </div>
      ) : null}

      {data.warnings.length > 0 ? (
        <div className="rounded-md bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          Some dashboard data is temporarily unavailable: {data.warnings.join(", ")}. Review the server log and database migration status.
        </div>
      ) : null}

      {showOutageBanner && data.summary.offline > 0 && !outageBannerDismissed ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <p className="min-w-0 flex-1">
            {data.summary.offline} monitor{data.summary.offline === 1 ? "" : "s"} currently offline. Verification and delivery history are available below.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label="Dismiss offline monitor alert"
            title="Dismiss"
            onClick={() => setOutageBannerDismissed(true)}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : null}

      <div className="space-y-4">
        {isEmptyWorkspace ? (
          <div className={cn("grid gap-4", summaryVisible && "lg:grid-cols-12")}>
            <div className={cn(summaryVisible ? "lg:col-span-8" : "lg:col-span-12")}>
              <EmptyDashboardGuide activation={data.activation} />
            </div>
            {summaryVisible ? (
              <div className="lg:col-span-4">
                <SummaryOverview summary={data.summary} />
              </div>
            ) : null}
          </div>
        ) : (
          <>
            {activationVisible ? <ActivationProgressStrip activation={data.activation} /> : null}
            {summaryVisible ? <SummaryOverview summary={data.summary} /> : null}
          </>
        )}

        {detailWidgets.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-12">
            {detailWidgets.map((widget) => (
              <div
                className={detailWidgets.length === 1 ? "lg:col-span-12" : dashboardWidgetClass(widget)}
                key={widget}
              >
                {renderWidget(widget)}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SummaryOverview({ summary }: { summary: DashboardData["summary"] }) {
  const metrics: Array<{ label: string; value: string; detail: string; Icon: LucideIcon; tone: string }> = [
    {
      label: "Total monitors",
      value: String(summary.total),
      detail: `${summary.active} active / ${summary.paused} paused`,
      Icon: ListChecks,
      tone: "text-foreground",
    },
    {
      label: "Online",
      value: String(summary.online),
      detail: summary.online > 0 ? "Healthy endpoints" : "No monitors online",
      Icon: Activity,
      tone: summary.online > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
    },
    {
      label: "Offline",
      value: String(summary.offline),
      detail: summary.offline > 0 ? "Need attention" : "No active incidents",
      Icon: XCircle,
      tone: summary.offline > 0 ? "text-destructive" : "text-foreground",
    },
    {
      label: "Average latency",
      value: summary.avgLatency === null ? "--" : `${summary.avgLatency}ms`,
      detail: summary.avgLatency === null ? "No completed checks" : `${summary.coverage.toFixed(1)}% coverage`,
      Icon: Gauge,
      tone: summary.avgLatency === null ? "text-foreground" : "text-primary",
    },
  ];

  return (
    <section className="h-full rounded-lg bg-card p-4 shadow-sm sm:p-5" aria-label="Dashboard summary">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">At a glance</h2>
          <p className="mt-1 text-xs text-muted-foreground">Live signals from this workspace.</p>
        </div>
        <Activity className="size-4 text-primary" aria-hidden="true" />
      </header>
      <dl className="mt-5 grid grid-cols-2 gap-2">
        {metrics.map(({ Icon, label, value, detail, tone }) => (
          <div className="rounded-md bg-background/35 px-3 py-3" key={label}>
            <dt className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </dt>
            <dd className={cn("mt-3 text-xl font-semibold tabular-nums tracking-tight", tone)}>{value}</dd>
            <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
          </div>
        ))}
      </dl>
    </section>
  );
}

function EmptyDashboardGuide({ activation }: { activation: DashboardData["activation"] }) {
  const monitorStep = activation.steps.find((step) => step.id === "monitor") ?? activation.steps[0];
  const upcomingSections: Array<{
    title: string;
    description: string;
    Icon: LucideIcon;
  }> = [
    {
      title: "Live status overview",
      description: "See what is online, offline, paused, or waiting for its first check.",
      Icon: Activity,
    },
    {
      title: "Latency and coverage",
      description: "Follow response time and successful check coverage as results arrive.",
      Icon: Gauge,
    },
    {
      title: "Incident timeline",
      description: "Review verified failures and recoveries with their timestamps and evidence.",
      Icon: Clock3,
    },
    {
      title: "Notification delivery",
      description: "Track delivered alerts, retries, and failures from one place.",
      Icon: BellRing,
    },
  ];

  return (
    <section className="overflow-hidden rounded-xl bg-card shadow-sm" aria-labelledby="empty-dashboard-title">
      <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
        <div className="flex flex-col justify-between p-6 sm:p-8 lg:p-10">
          <div className="max-w-3xl">
            <div className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Activity className="size-5" aria-hidden="true" />
            </div>
            <h2 id="empty-dashboard-title" className="mt-6 max-w-2xl text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
              Your live dashboard is one monitor away.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              Add your first endpoint and this setup view will be replaced by live status, latency, incident, and delivery data. New check results update the dashboard automatically.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href={monitorStep.href} className={cn(buttonVariants({ size: "lg" }), "w-full gap-2 sm:w-auto")}>
                Create first monitor
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <p className="text-xs leading-5 text-muted-foreground">
                This guide disappears as soon as the first monitor is added.
              </p>
            </div>
          </div>

          <ol className="mt-10 grid gap-4 border-t border-border/70 pt-6 sm:grid-cols-3">
            {activation.steps.map((step, index) => (
              <li className="flex items-start gap-3" key={step.id}>
                {step.complete ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" aria-hidden="true" />
                ) : (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground">
                    {index + 1}
                  </span>
                )}
                <div>
                  <p className="text-sm font-medium">{step.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {step.complete ? "Complete" : index === 0 ? "Start here" : "Follows automatically"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="bg-background/35 p-6 sm:p-8 lg:p-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-medium">What appears automatically</h3>
            <span className="rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
              After your first monitor
            </span>
          </div>
          <div className="mt-6 divide-y divide-border/70">
            {upcomingSections.map(({ title, description, Icon }) => (
              <div className="flex gap-4 py-5 first:pt-0 last:pb-0" key={title}>
                <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-7 flex items-start gap-2 border-t border-border/70 pt-5 text-xs leading-5 text-muted-foreground">
            <RefreshCw className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Dashboard sections stay current through the live connection—there is no manual refresh step.
          </p>
        </div>
      </div>
    </section>
  );
}

function ActivationProgressStrip({ activation }: { activation: DashboardData["activation"] }) {
  const { completed, total, percent, nextStep } = getActivationProgress(activation);
  if (!nextStep) {
    return null;
  }

  return (
    <section className="rounded-lg bg-card px-4 py-3 shadow-sm" aria-labelledby="activation-progress-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <ListChecks className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 id="activation-progress-title" className="text-sm font-medium">Workspace activation</h2>
              <span
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="text-xs tabular-nums text-muted-foreground"
              >
                {completed} of {total} steps complete
              </span>
            </div>
            <p className="truncate text-xs text-muted-foreground">Next: {nextStep.label}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div
            className="h-1.5 min-w-20 flex-1 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Workspace activation progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={`${completed} of ${total} activation steps complete`}
          >
            <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </div>
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{percent}%</span>
          <Link href={nextStep.href} className={cn(buttonVariants({ size: "sm" }), "min-h-9 shrink-0 gap-1.5") }>
            {nextStep.id === "monitor" ? "Create first monitor" : "Continue setup"}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function dashboardWidgetClass(widget: DashboardWidgetId) {
  if (widget === "system") return "lg:col-span-7";
  if (widget === "monitor-focus") return "lg:col-span-5";
  if (widget === "company-health") return "lg:col-span-4";
  if (widget === "recent-events") return "lg:col-span-8";
  if (widget === "delivery") return "lg:col-span-12";
  return "lg:col-span-12";
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
    <section className="h-full rounded-lg bg-card p-4 shadow-sm sm:p-5">
      <header>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-medium">Company health</h2>
            <p className="mt-1 text-xs text-muted-foreground">Grouped status across your monitored services.</p>
          </div>
          <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
          <PanelPager page={page} totalPages={totalPages} onPageChange={onPageChange} />
        </div>
      </header>
      <div className="mt-5 space-y-2">
        {companies.length === 0 ? (
          <div className="flex min-h-28 items-center gap-3 rounded-md bg-background/35 p-4">
            <Building2 className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">No company groups yet</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Add a company when you want to group monitors by team or service.</p>
            </div>
          </div>
        ) : (
          companies.map((company) => (
            <div key={company.id} className="space-y-3 rounded-md bg-background/35 p-3">
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
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${company.active > 0 ? (company.up / company.active) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function PanelRecentEvents({
  events,
  page,
  totalPages,
  onPageChange,
  timeDisplaySettings,
}: {
  events: DashboardData["events"];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  timeDisplaySettings: TimeDisplaySettings;
}) {
  return (
    <section className="h-full rounded-lg bg-card p-4 shadow-sm sm:p-5">
      <header>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-medium">Recent events</h2>
            <p className="mt-1 text-xs text-muted-foreground">Verified failures and recoveries that need context.</p>
          </div>
          <BellRing className="size-4 text-muted-foreground" aria-hidden="true" />
          <PanelPager page={page} totalPages={totalPages} onPageChange={onPageChange} />
        </div>
      </header>
      <div className="mt-5">
        {events.length === 0 ? (
          <div className="flex min-h-28 items-center gap-3 rounded-md bg-background/35 p-4">
            <BellRing className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">Nothing to review yet</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Verified incidents and recoveries will appear here after your first monitor runs.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md bg-background/20">
            {events.map((event) => (
            <div key={event.id} className="flex flex-col gap-2 bg-background/35 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
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
                {formatDateTime(event.createdAt, timeDisplaySettings)}
              </div>
            </div>
            ))}
          </div>
        )}
      </div>
    </section>
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
      <Button variant="outline" size="icon-sm" aria-label="Previous page" onClick={() => onPageChange(page - 1)} disabled={page === 1}>
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <span className="min-w-14 text-center text-[11px] text-muted-foreground">
        {page} / {totalPages}
      </span>
      <Button variant="outline" size="icon-sm" aria-label="Next page" onClick={() => onPageChange(page + 1)} disabled={page === totalPages}>
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
    value === "0" ? "text-foreground" : tone === "green"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-600 dark:text-amber-400"
        : tone === "rose"
          ? "text-destructive"
          : "";

  return (
    <div className="rounded-md bg-background/35 p-3">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className={`mt-3 text-lg font-semibold tabular-nums tracking-tight ${valueTone}`}>{value}</dd>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{sub}</p>
    </div>
  );
}

function PanelDelivery({ delivery }: { delivery: DashboardData["delivery"] }) {
  const metrics = [
    { label: "Delivered", value: String(delivery.delivered), sub: "Successful deliveries", tone: "green" as const },
    { label: "Retry queue", value: String(delivery.pendingRetries), sub: "Waiting to retry", tone: "amber" as const },
    { label: "Failed", value: String(delivery.failed), sub: "Need review", tone: "rose" as const },
    { label: "Retrying", value: String(delivery.retrying), sub: "Next attempt pending", tone: "neutral" as const },
    { label: "Dead-lettered", value: String(delivery.deadLettered), sub: "Permanent failures", tone: "rose" as const },
  ];

  return (
    <section className="h-full rounded-lg bg-card p-4 shadow-sm sm:p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Notification delivery</h2>
          <p className="mt-1 text-xs text-muted-foreground">A clear trail from check to alert.</p>
        </div>
        <BellRing className="size-4 text-muted-foreground" aria-hidden="true" />
      </header>
      <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </dl>
      {delivery.delivered === 0 && delivery.failed === 0 && delivery.pendingRetries === 0 && delivery.retrying === 0 && delivery.deadLettered === 0 ? (
        <p className="mt-4 flex items-center gap-2 rounded-md bg-background/35 px-3 py-2.5 text-xs text-muted-foreground">
          <BellRing className="size-3.5 shrink-0" aria-hidden="true" />
          Waiting for the first monitor delivery.
        </p>
      ) : null}
    </section>
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
