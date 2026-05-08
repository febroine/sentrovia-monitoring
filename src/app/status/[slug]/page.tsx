import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock3, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicStatusPage } from "@/lib/public-status/service";
import { formatDateTime } from "@/lib/time";

type Params = Promise<{ slug: string }>;

export default async function PublicStatusPage({ params }: { params: Params }) {
  const { slug } = await params;
  const statusPage = await getPublicStatusPage(slug);

  if (!statusPage) {
    notFound();
  }

  const timeDisplaySettings = {
    timeZone: statusPage.timeZone,
    use24HourClock: statusPage.use24HourClock,
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc,#eef2ff)] px-4 py-10 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-sky-200 bg-white shadow-sm">
          <div className="border-l-4 border-l-sky-500 px-6 py-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-sky-200 text-sky-700">
                    Public Status
                  </Badge>
                  <Badge variant="outline" className="border-slate-200 text-slate-600">
                    {statusPage.totals.outage > 0 ? "Degraded" : "Operational"}
                  </Badge>
                </div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight">{statusPage.title}</h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{statusPage.summary}</p>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Updated{" "}
                {formatDateTime(statusPage.generatedAt, timeDisplaySettings, {
                  includeSeconds: true,
                  includeTimeZone: true,
                })}
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-4">
          <StatusMetric
            title="Operational"
            value={String(statusPage.totals.operational)}
            detail="Healthy services"
            tone="emerald"
            icon={CheckCircle2}
          />
          <StatusMetric
            title="Degraded"
            value={String(statusPage.totals.degraded)}
            detail="Verification or pending checks"
            tone="amber"
            icon={Clock3}
          />
          <StatusMetric
            title="Outage"
            value={String(statusPage.totals.outage)}
            detail="Active failing services"
            tone="rose"
            icon={AlertTriangle}
          />
          <StatusMetric
            title="Coverage"
            value={String(statusPage.totals.total)}
            detail="Published services"
            tone="sky"
            icon={ShieldCheck}
          />
        </div>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <CardTitle className="text-base">Service Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            {statusPage.services.map((service) => (
              <div
                key={service.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{service.name}</p>
                    <Badge variant="outline" className="border-slate-200 text-slate-600">
                      {service.company}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        service.status === "up"
                          ? "border-emerald-200 text-emerald-700"
                          : service.status === "pending"
                            ? "border-amber-200 text-amber-700"
                            : "border-rose-200 text-rose-700"
                      }
                    >
                      {service.status === "up"
                        ? "Operational"
                        : service.status === "pending"
                          ? "Degraded"
                          : "Outage"}
                    </Badge>
                    {service.hasOpenIncident ? (
                      <Badge variant="outline" className="border-rose-200 text-rose-700">
                        Incident open
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    Last checked{" "}
                    {service.lastCheckedAt
                      ? formatDateTime(service.lastCheckedAt, timeDisplaySettings, { includeSeconds: true })
                      : "not yet"}
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[340px]">
                  <StatusDetail label="Health" value={`${service.healthScore} / ${service.healthLabel}`} />
                  <StatusDetail label="Uptime" value={service.uptime} />
                  <StatusDetail
                    label="Latency"
                    value={typeof service.latencyMs === "number" ? `${service.latencyMs}ms` : "--"}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function StatusMetric({
  title,
  value,
  detail,
  tone,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  tone: "emerald" | "amber" | "rose" | "sky";
  icon: typeof CheckCircle2;
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 text-emerald-700"
      : tone === "amber"
        ? "border-amber-200 text-amber-700"
        : tone === "rose"
          ? "border-rose-200 text-rose-700"
          : "border-sky-200 text-sky-700";

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{detail}</p>
        </div>
        <div className={`rounded-2xl border bg-white p-2 ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
