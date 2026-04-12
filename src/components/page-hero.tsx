"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type HeroMetric = {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
};

export function PageHero({
  eyebrow,
  title,
  description,
  metrics,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  metrics: HeroMetric[];
  actions?: ReactNode;
}) {
  return (
    <header className="overflow-hidden rounded-3xl border border-border/70 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.08),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_24%)]">
      <div className="border-l-4 border-l-sky-500 px-5 py-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <Badge variant="outline" className="border-sky-500/25 text-sky-700 dark:text-sky-300">
              {eyebrow}
            </Badge>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          </div>

          <div className="space-y-3 xl:min-w-[420px]">
            {actions}
            <div className="grid gap-3 sm:grid-cols-2">
              {metrics.map((metric) => {
                const Icon = metric.icon;

                return (
                  <div key={metric.label} className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          {metric.label}
                        </p>
                        <p className="text-lg font-semibold">{metric.value}</p>
                        <p className="text-xs text-muted-foreground">{metric.detail}</p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/10 p-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
