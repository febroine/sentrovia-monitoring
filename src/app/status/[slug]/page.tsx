import { notFound } from "next/navigation";
import {
  AlertTriangle,
  Globe2,
} from "lucide-react";
import { SentroviaMark } from "@/components/brand/sentrovia-mark";
import { getPublicStatusPage } from "@/lib/public-status/service";
import { formatDateTime, type TimeDisplaySettings } from "@/lib/time";
import { cn } from "@/lib/utils";
import { StatusPageRefresh } from "./status-page-refresh";
import { ServiceStatusBoard } from "./service-status-board";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = Promise<{ slug: string }>;
type StatusPageData = NonNullable<Awaited<ReturnType<typeof getPublicStatusPage>>>;

export default async function PublicStatusPage({ params }: { params: Params }) {
  const { slug } = await params;
  const statusPage = await getPublicStatusPage(slug);

  if (!statusPage) {
    notFound();
  }

  return <PublicStatusView statusPage={statusPage} />;
}

function PublicStatusView({ statusPage }: { statusPage: StatusPageData }) {
  const timeDisplaySettings = {
    timeZone: statusPage.timeZone,
    use24HourClock: statusPage.use24HourClock,
  };
  const overall = getOverallStatus(statusPage.totals);
  const outageServices = statusPage.services.filter((service) => service.status === "down");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
        {outageServices.length > 0 ? <PublicOutageBanner services={outageServices} /> : null}
        <StatusHeader
          companyName={statusPage.scope.companyName}
          generatedAt={statusPage.generatedAt}
          overall={overall}
          timeDisplaySettings={timeDisplaySettings}
          title={statusPage.title}
        />
        <StatusOverview overall={overall} statusPage={statusPage} />
        <ServiceStatusBoard services={statusPage.services} timeDisplaySettings={timeDisplaySettings} />
        <PublicIncidentHistory incidents={statusPage.incidents} timeDisplaySettings={timeDisplaySettings} />
      </div>
    </main>
  );
}

function PublicIncidentHistory({
  incidents,
  timeDisplaySettings,
}: {
  incidents: StatusPageData["incidents"];
  timeDisplaySettings: TimeDisplaySettings;
}) {
  if (incidents.length === 0) return null;

  return (
    <section className="border-t border-border pt-5">
      <div>
        <h2 className="text-lg font-semibold">Incident history</h2>
        <p className="mt-1 text-sm text-muted-foreground">Public updates from the last 30 days.</p>
      </div>
      <div className="mt-4 divide-y divide-border border-y border-border">
        {incidents.map((incident) => (
          <article className="py-5" key={incident.id}>
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="break-all font-semibold">{incident.monitorUrl}</h3>
              <span className="text-sm text-muted-foreground">
                {incident.resolvedAt ? "Resolved" : "Active"} · {formatDateTime(incident.startedAt, timeDisplaySettings)}
              </span>
            </div>
            <ol className="mt-4 space-y-4 border-l border-border pl-4">
              {incident.updates.map((update) => (
                <li key={update.id}>
                  <p className="text-sm leading-6">{update.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(update.createdAt, timeDisplaySettings, { includeTimeZone: true })}
                  </p>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
}

type PublicStatusService = StatusPageData["services"][number];

function PublicOutageBanner({ services }: { services: PublicStatusService[] }) {
  const serviceLabel = services.length === 1 ? "This service is" : "These services are";

  return (
    <section
      aria-live="assertive"
      aria-label="Current service outage"
      className="overflow-hidden border-l-4 border-rose-500 bg-rose-50 dark:bg-rose-950/35"
      role="alert"
    >
      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex min-w-0 gap-4">
          <AlertTriangle className="mt-1 size-5 shrink-0 text-rose-600 dark:text-rose-400" />
          <div className="min-w-0">
            <p className="text-lg font-semibold text-rose-900 dark:text-rose-100">Service outage detected</p>
            <p className="mt-1 text-sm leading-6 text-rose-800/85 dark:text-rose-200/85">
              {serviceLabel} currently unavailable. The affected service{services.length === 1 ? " is" : "s are"} listed below.
            </p>
          </div>
        </div>
        <span className="w-fit shrink-0 text-xs font-medium text-rose-700 dark:text-rose-300">
          {services.length} down
        </span>
      </div>

      <ul className="divide-y divide-rose-500/20 border-t border-rose-500/25 bg-rose-100/55 dark:bg-rose-950/20">
        {services.map((service) => (
          <li className="flex min-w-0 items-start gap-3 px-5 py-3 sm:px-6" key={service.id}>
            <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-rose-600 dark:bg-rose-400" />
            <div className="min-w-0">
              <p className="break-all text-sm font-semibold text-rose-950 dark:text-rose-100">{service.url}</p>
              <p className="mt-1 text-xs text-rose-800/75 dark:text-rose-200/75">{service.company}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusHeader({
  companyName,
  generatedAt,
  overall,
  timeDisplaySettings,
  title,
}: {
  companyName: string | null;
  generatedAt: string;
  overall: ReturnType<typeof getOverallStatus>;
  timeDisplaySettings: TimeDisplaySettings;
  title: string;
}) {
  const updatedAt = formatDateTime(generatedAt, timeDisplaySettings, {
    includeSeconds: true,
    includeTimeZone: true,
  });

  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <SentroviaMark className="size-10 shrink-0 text-emerald-600 dark:text-emerald-300" />
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {companyName ? `${companyName} public status` : "Sentrovia public status"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className={cn("inline-flex items-center gap-2 font-semibold", overall.text)}>
          <span className={cn("size-3 rounded-full", overall.dot)} />
          {overall.label}
        </span>
        <span className="text-muted-foreground">Updated {updatedAt}</span>
        <StatusPageRefresh />
      </div>
    </header>
  );
}

function StatusOverview({
  overall,
  statusPage,
}: {
  overall: ReturnType<typeof getOverallStatus>;
  statusPage: StatusPageData;
}) {
  const metrics = [
    { label: "Operational", value: statusPage.totals.operational, tone: "text-emerald-600 dark:text-emerald-300" },
    { label: "Degraded", value: statusPage.totals.degraded, tone: "text-amber-600 dark:text-amber-300" },
    { label: "Outage", value: statusPage.totals.outage, tone: "text-rose-600 dark:text-rose-300" },
    { label: "Published", value: statusPage.totals.total, tone: "text-slate-600 dark:text-slate-300" },
  ];

  return (
    <section className={cn("overflow-hidden rounded-md border", overall.border, overall.surface)}>
      <div className="flex flex-col gap-3 border-b border-current/10 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className={cn("text-lg font-semibold", overall.text)}>{overall.badge}</p>
          <p className="mt-1 max-w-5xl text-sm leading-6 text-muted-foreground sm:text-base">
            {statusPage.summary}
          </p>
        </div>
        {statusPage.scope.companyName ? (
          <div className="inline-flex w-fit items-center gap-2 rounded-md border border-current/15 bg-background/65 px-3 py-2 text-sm font-medium">
            <Globe2 className="h-4 w-4" />
            {statusPage.scope.companyName}
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {metrics.map((metric) => (
          <StatusMetric key={metric.label} {...metric} />
        ))}
      </div>
    </section>
  );
}

function StatusMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: string;
  value: number;
}) {
  return (
    <div className="bg-background/55 px-4 py-4 sm:px-5">
      <p className={cn("text-xl font-semibold", tone)}>{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function getOverallStatus(totals: { total: number; operational: number; degraded: number; outage: number }) {
  if (totals.outage > 0) {
    return {
      label: "Service outage",
      badge: "One or more services are unavailable",
      border: "border-rose-500/45",
      dot: "bg-rose-500",
      text: "text-rose-700 dark:text-rose-300",
      surface: "bg-rose-50/70 dark:bg-rose-950/20",
    };
  }

  if (totals.degraded > 0) {
    return {
      label: "Partial degradation",
      badge: "Some services are responding slowly or being verified",
      border: "border-amber-500/45",
      dot: "bg-amber-500",
      text: "text-amber-700 dark:text-amber-300",
      surface: "bg-amber-50/70 dark:bg-amber-950/20",
    };
  }

  if (totals.total === 0) {
    return {
      label: "No services published",
      badge: "No active monitors are available",
      border: "border-slate-500/35",
      dot: "bg-slate-500",
      text: "text-slate-700 dark:text-slate-300",
      surface: "bg-slate-50/70 dark:bg-slate-950/20",
    };
  }

  return {
    label: "All systems operational",
    badge: "All published services are operational",
    border: "border-emerald-500/45",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
    surface: "bg-emerald-50/70 dark:bg-emerald-950/20",
  };
}
