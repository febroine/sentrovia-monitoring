"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Globe, Search, ShieldCheck, Signal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

  return (
    <div className="space-y-4 rounded-xl border bg-muted/15 p-4">
      {report ? (
        <div className="grid gap-3 md:grid-cols-3">
          <MetricCard
            icon={ShieldCheck}
            label="24h SLA"
            value={`${report.periods[0]?.uptimePct.toFixed(2) ?? "100.00"}%`}
            sub={`${report.periods[0]?.incidents ?? 0} incidents`}
            tone="green"
          />
          <MetricCard
            icon={Signal}
            label="7d SLA"
            value={`${report.periods[1]?.uptimePct.toFixed(2) ?? "100.00"}%`}
            sub={`${report.averageLatencyMs}ms avg latency`}
            tone="amber"
          />
          <MetricCard
            icon={Globe}
            label="Status spread"
            value={report.statusCodes[0] ? `HTTP ${report.statusCodes[0].statusCode}` : "Clean"}
            sub={report.statusCodes[0] ? `${report.statusCodes[0].count} recent hits` : "No recent codes"}
            tone="neutral"
          />
        </div>
      ) : null}

      {monthlyReport?.months.length ? (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {monthlyReport.months.map((month) => (
            <MetricCard
              key={month.label}
              icon={Signal}
              label={month.label}
              value={`${month.uptimePct.toFixed(1)}%`}
              sub={`${month.checks} checks`}
              tone={month.uptimePct < 98 ? "amber" : "green"}
            />
          ))}
        </div>
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

      <div className="mt-4 grid gap-3">
        {pageItems.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            No sites matched the current search.
          </div>
        ) : (
          pageItems.map((monitor) => (
            <Card key={monitor.id} className="overflow-hidden">
              <CardContent className="border-l-2 border-l-slate-400 px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
                    <Badge variant="secondary">
                      {monitor.lastCheckedAt
                        ? new Date(monitor.lastCheckedAt).toLocaleString()
                        : "Never checked"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
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

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Globe;
  label: string;
  value: string;
  sub: string;
  tone: "green" | "amber" | "neutral";
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent
        className={`border-l-2 px-4 py-3 ${
          tone === "green" ? "border-l-emerald-500" : tone === "amber" ? "border-l-amber-500" : "border-l-slate-400"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
            <p className="text-xl font-semibold tracking-tight">{value}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
          <div className="rounded-xl bg-muted/70 p-2.5">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
