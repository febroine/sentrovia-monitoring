import { notFound } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Globe2,
  ShieldCheck,
  type LucideIcon,
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

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="flex w-full flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 2xl:px-10">
        <StatusHeader
          companyName={statusPage.scope.companyName}
          generatedAt={statusPage.generatedAt}
          overall={overall}
          timeDisplaySettings={timeDisplaySettings}
          title={statusPage.title}
        />
        <StatusOverview overall={overall} statusPage={statusPage} />
        <ServiceStatusBoard services={statusPage.services} timeDisplaySettings={timeDisplaySettings} />
      </div>
    </main>
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
        <div className="flex size-12 shrink-0 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
          <SentroviaMark className="text-base" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">
            {companyName ? `${companyName} public status` : "Sentrovia public status"}
          </p>
          <h1 className="mt-1 break-words text-2xl font-semibold sm:text-3xl">{title}</h1>
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
    { label: "Operational", value: statusPage.totals.operational, icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-300" },
    { label: "Degraded", value: statusPage.totals.degraded, icon: Clock3, tone: "text-amber-600 dark:text-amber-300" },
    { label: "Outage", value: statusPage.totals.outage, icon: AlertTriangle, tone: "text-rose-600 dark:text-rose-300" },
    { label: "Published", value: statusPage.totals.total, icon: ShieldCheck, tone: "text-slate-600 dark:text-slate-300" },
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
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: LucideIcon;
  label: string;
  tone: string;
  value: number;
}) {
  return (
    <div className="flex min-h-24 items-center gap-3 bg-background/55 px-4 py-4 sm:px-5">
      <Icon className={cn("h-5 w-5 shrink-0", tone)} />
      <div>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
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
