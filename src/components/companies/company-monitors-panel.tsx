"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Globe, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CompanyMonthlyReport, CompanySlaReport, MonitorRecord } from "@/lib/monitors/types";

const PAGE_SIZE = 10;

export function CompanyMonitorsPanel({
  companyId,
  companyName,
  monitors,
}: {
  companyId: string;
  companyName: string;
  monitors: MonitorRecord[];
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [report, setReport] = useState<CompanySlaReport | null>(null);
  const [monthlyReport, setMonthlyReport] = useState<CompanyMonthlyReport | null>(null);

  useEffect(() => {
    let active = true;

    fetch(`/api/companies/${companyId}/report`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { report?: CompanySlaReport };
        if (active) {
          setReport(data.report ?? null);
        }
      })
      .catch(() => {
        if (active) {
          setReport(null);
        }
      });

    fetch(`/api/companies/${companyId}/monthly-report`, { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as { report?: CompanyMonthlyReport };
        if (active) {
          setMonthlyReport(data.report ?? null);
        }
      })
      .catch(() => {
        if (active) {
          setMonthlyReport(null);
        }
      });

    return () => {
      active = false;
    };
  }, [companyId]);

  const filtered = useMemo(
    () =>
      monitors.filter((monitor) => {
        const query = search.trim().toLowerCase();
        if (!query) {
          return true;
        }

        return (
          monitor.name.toLowerCase().includes(query) ||
          monitor.url.toLowerCase().includes(query)
        );
      }),
    [monitors, search]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const dailyPeriod = report?.periods[0];
  const weeklyPeriod = report?.periods[1];

  return (
    <div className="space-y-5">
      {report ? (
        <dl className="grid border-y md:grid-cols-3 md:divide-x">
          <MetricItem
            label="24h SLA"
            value={formatSlaValue(dailyPeriod)}
            sub={dailyPeriod?.hasData ? `${dailyPeriod.outages} confirmed outages` : "No completed checks"}
            tone={dailyPeriod?.hasData ? "green" : "neutral"}
          />
          <MetricItem
            label="7d SLA"
            value={formatSlaValue(weeklyPeriod)}
            sub={report.hasLatencySamples ? `${report.averageLatencyMs}ms recent avg latency` : "No latency samples"}
            tone={weeklyPeriod?.hasData ? "amber" : "neutral"}
          />
          <MetricItem
            label="Status spread"
            value={report.statusCodes[0] ? `HTTP ${report.statusCodes[0].statusCode}` : "No HTTP data"}
            sub={report.statusCodes[0] ? `${report.statusCodes[0].count} recent hits` : "No recent codes"}
            tone="neutral"
          />
        </dl>
      ) : null}

      {monthlyReport?.months.length ? (
        <dl className="grid border-y md:grid-cols-3 xl:grid-cols-6 xl:divide-x">
          {monthlyReport.months.map((month) => (
            <MetricItem
              key={month.label}
              label={month.label}
              value={`${month.uptimePct.toFixed(1)}%`}
              sub={`${month.checks} checks`}
              tone={month.uptimePct < 98 ? "amber" : "green"}
            />
          ))}
        </dl>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium">{companyName} monitors</p>
          <p className="text-xs text-muted-foreground">
            {filtered.length} endpoint{filtered.length === 1 ? "" : "s"} matched
          </p>
        </div>
        <div className="relative w-full lg:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search site name or URL"
            className="pl-9"
          />
        </div>
      </div>

      <div className="divide-y border-y">
        {pageItems.length === 0 ? (
          <div className="py-8 text-sm text-muted-foreground">
            No sites matched the current search.
          </div>
        ) : (
          pageItems.map((monitor) => (
            <div key={monitor.id} className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium">{monitor.name}</p>
                </div>
                <p className="text-xs text-muted-foreground">{monitor.url}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={
                    !monitor.isActive
                      ? "text-muted-foreground"
                      : monitor.status === "up"
                      ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                      : monitor.status === "down"
                        ? "border-destructive/30 text-destructive"
                        : ""
                  }
                >
                  {monitor.isActive ? monitor.status : "paused"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {monitor.lastCheckedAt
                    ? new Date(monitor.lastCheckedAt).toLocaleString()
                    : "Never checked"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Page {safePage} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage === 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage === totalPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatSlaValue(period: CompanySlaReport["periods"][number] | undefined) {
  return period?.hasData ? `${period.uptimePct.toFixed(2)}%` : "No data";
}

function MetricItem({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "green" | "amber" | "neutral";
}) {
  return (
    <div className={`border-b px-4 py-3 last:border-b-0 md:border-b-0 ${
      tone === "green" ? "text-emerald-600 dark:text-emerald-400" : tone === "amber" ? "text-amber-600 dark:text-amber-400" : ""
    }`}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tracking-tight">{value}</dd>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
