import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock3, Globe2, ShieldCheck, type LucideIcon } from "lucide-react";
import { SentroviaMark } from "@/components/brand/sentrovia-mark";
import { Badge } from "@/components/ui/badge";
import { getPublicStatusPage } from "@/lib/public-status/service";
import { formatDateTime, type TimeDisplaySettings } from "@/lib/time";
import { cn } from "@/lib/utils";

type Params = Promise<{ slug: string }>;
type StatusPageData = NonNullable<Awaited<ReturnType<typeof getPublicStatusPage>>>;
type StatusService = StatusPageData["services"][number];
type ServiceStatus = "up" | "pending" | "down";
type StatusTone = "emerald" | "amber" | "rose" | "slate";

type StatusMetricProps = {
  title: string;
  value: string;
  detail: string;
  tone: StatusTone;
  icon: LucideIcon;
};

type StatusDetailProps = {
  label: string;
  value: string;
};

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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <StatusHeader
          generatedAt={statusPage.generatedAt}
          overall={overall}
          timeDisplaySettings={timeDisplaySettings}
          title={statusPage.title}
        />
        <StatusSummary overall={overall} summary={statusPage.summary} totals={statusPage.totals} />
        <ServiceStatusList services={statusPage.services} timeDisplaySettings={timeDisplaySettings} />
      </div>
    </main>
  );
}

function StatusHeader({
  generatedAt,
  overall,
  timeDisplaySettings,
  title,
}: {
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
    <header className="flex flex-col gap-4 border-b border-border/70 pb-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
          <SentroviaMark className="text-sm" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Sentrovia Public Status
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{title}</h1>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card/70 px-4 py-3 text-sm sm:flex-row sm:items-center sm:gap-4">
        <span className={cn("inline-flex items-center gap-2 font-medium", overall.text)}>
          <span className={cn("size-2 rounded-full", overall.dot)} />
          {overall.label}
        </span>
        <span className="text-muted-foreground">Updated {updatedAt}</span>
      </div>
    </header>
  );
}

function StatusSummary({
  overall,
  summary,
  totals,
}: {
  overall: ReturnType<typeof getOverallStatus>;
  summary: string;
  totals: StatusPageData["totals"];
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
      <div className={cn("rounded-lg border bg-card/75 p-5", overall.border)}>
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <Badge variant="outline" className={cn("border-border bg-background/60", overall.text)}>
              {overall.badge}
            </Badge>
            <p className="mt-4 text-base leading-7 text-muted-foreground">{summary}</p>
          </div>
          <PublishedServices total={totals.total} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatusMetric
          title="Operational"
          value={String(totals.operational)}
          detail="Healthy"
          tone="emerald"
          icon={CheckCircle2}
        />
        <StatusMetric
          title="Degraded"
          value={String(totals.degraded)}
          detail="Pending"
          tone="amber"
          icon={Clock3}
        />
        <StatusMetric
          title="Outage"
          value={String(totals.outage)}
          detail="Failing"
          tone="rose"
          icon={AlertTriangle}
        />
        <StatusMetric
          title="Coverage"
          value={String(totals.total)}
          detail="Tracked"
          tone="slate"
          icon={ShieldCheck}
        />
      </div>
    </section>
  );
}

function PublishedServices({ total }: { total: number }) {
  return (
    <div className="rounded-lg border border-border bg-background/70 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Published Services
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{total}</p>
    </div>
  );
}

function ServiceStatusList({
  services,
  timeDisplaySettings,
}: {
  services: StatusService[];
  timeDisplaySettings: TimeDisplaySettings;
}) {
  return (
    <section className="rounded-lg border border-border bg-card/70">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Service Status</p>
          <p className="mt-1 text-xs text-muted-foreground">Live view of published monitors and incidents.</p>
        </div>
        <Badge variant="outline" className="w-fit border-border bg-background/60 text-muted-foreground">
          {services.length} services
        </Badge>
      </div>

      <div className="divide-y divide-border">
        {services.length > 0 ? (
          services.map((service) => (
            <ServiceRow
              key={service.id}
              healthLabel={service.healthLabel}
              lastCheckedAt={formatLastCheckedAt(service.lastCheckedAt, timeDisplaySettings)}
              service={service}
              status={normalizeServiceStatus(service.status)}
            />
          ))
        ) : (
          <EmptyServiceState />
        )}
      </div>
    </section>
  );
}

function EmptyServiceState() {
  return (
    <div className="px-5 py-10 text-center text-sm text-muted-foreground">
      No services are currently published on this status page.
    </div>
  );
}

function StatusMetric({ title, value, detail, tone, icon: Icon }: StatusMetricProps) {
  const toneClass = getToneClass(tone);

  return (
    <div className="rounded-lg border border-border bg-card/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg border", toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function ServiceRow({
  healthLabel,
  lastCheckedAt,
  service,
  status,
}: {
  healthLabel: string;
  lastCheckedAt: string;
  service: StatusService;
  status: ServiceStatus;
}) {
  const meta = getStatusMeta(status);

  return (
    <article className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("size-2.5 rounded-full", meta.dot)} />
          <h2 className="truncate text-sm font-semibold">{service.name}</h2>
          <Badge variant="outline" className="border-border bg-background/60 text-muted-foreground">
            <Globe2 className="mr-1 h-3 w-3" />
            {service.company}
          </Badge>
          <Badge variant="outline" className={cn("border-border bg-background/60", meta.text)}>
            {meta.label}
          </Badge>
          {service.hasOpenIncident ? (
            <Badge variant="outline" className="border-rose-500/35 bg-rose-500/10 text-rose-300">
              Incident open
            </Badge>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Last checked {lastCheckedAt}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <StatusDetail label="Health" value={`${service.healthScore} / ${healthLabel}`} />
        <StatusDetail label="Uptime" value={service.uptime} />
        <StatusDetail label="Latency" value={typeof service.latencyMs === "number" ? `${service.latencyMs}ms` : "--"} />
      </div>
    </article>
  );
}

function StatusDetail({ label, value }: StatusDetailProps) {
  return (
    <div className="rounded-lg border border-border bg-background/70 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function getOverallStatus(totals: { total: number; operational: number; degraded: number; outage: number }) {
  if (totals.outage > 0) {
    return {
      label: "Service outage",
      badge: "Action needed",
      border: "border-rose-500/35",
      dot: "bg-rose-400",
      text: "text-rose-300",
    };
  }

  if (totals.degraded > 0) {
    return {
      label: "Partial degradation",
      badge: "Degraded performance",
      border: "border-amber-500/35",
      dot: "bg-amber-400",
      text: "text-amber-300",
    };
  }

  if (totals.total === 0) {
    return {
      label: "No services published",
      badge: "Empty status page",
      border: "border-slate-500/35",
      dot: "bg-slate-400",
      text: "text-slate-300",
    };
  }

  return {
    label: "All systems operational",
    badge: "Operational",
    border: "border-emerald-500/35",
    dot: "bg-emerald-400",
    text: "text-emerald-300",
  };
}

function getStatusMeta(status: ServiceStatus) {
  if (status === "down") {
    return { label: "Outage", dot: "bg-rose-400", text: "text-rose-300" };
  }

  if (status === "pending") {
    return { label: "Degraded", dot: "bg-amber-400", text: "text-amber-300" };
  }

  return { label: "Operational", dot: "bg-emerald-400", text: "text-emerald-300" };
}

function getToneClass(tone: StatusTone) {
  if (tone === "emerald") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }

  if (tone === "amber") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }

  if (tone === "rose") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  }

  return "border-slate-500/30 bg-slate-500/10 text-slate-300";
}

function normalizeServiceStatus(status: string): ServiceStatus {
  if (status === "up" || status === "pending" || status === "down") {
    return status;
  }

  return "pending";
}

function formatLastCheckedAt(value: string | null, settings: TimeDisplaySettings) {
  if (!value) {
    return "Not checked yet";
  }

  return formatDateTime(value, settings, { includeSeconds: true });
}
