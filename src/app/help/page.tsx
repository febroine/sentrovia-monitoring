"use client";

import type { ElementType } from "react";
import { Clock3, Radar, Sparkles } from "lucide-react";
import { HelpFaqPanel } from "@/components/help/help-faq-panel";
import { helpCategories, quickNotes } from "@/components/help/help-data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function HelpPage() {
  return (
    <div className="flex w-full flex-col gap-8 animate-in fade-in duration-300">
      <section className="overflow-hidden rounded-3xl border bg-card">
        <div className="bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.16),transparent_30%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_32%)] px-6 py-8 md:px-8 lg:px-10 lg:py-10">
          <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr] xl:items-start">
            <div className="space-y-4">
              <Badge variant="outline" className="border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-300">
                Help Center
              </Badge>
              <div className="space-y-3">
                <h1 className="max-w-5xl text-3xl font-semibold tracking-tight md:text-4xl xl:text-[3rem] xl:leading-[1.04]">
                  A practical guide to how Sentrovia behaves in production
                </h1>
                <p className="max-w-4xl text-sm leading-7 text-muted-foreground md:text-[15px]">
                  This page explains the real system, not just the screens. It covers worker scheduling,
                  verification mode, monitor types, delivery decisions, reports, backup flows,
                  logs, worker insights, and Docker runtime behavior in one readable place.
                </p>
              </div>
            </div>

            <Card className="overflow-hidden border-border/70 bg-background/90 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Start here when something feels off</CardTitle>
                <CardDescription>
                  These checks usually answer whether the issue is execution, routing, delivery, or version drift.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {quickNotes.map((note, index) => (
                  <div key={note} className="rounded-2xl border bg-muted/[0.06] px-4 py-3 text-sm leading-6 text-muted-foreground">
                    <span className="mr-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground">
                      0{index + 1}
                    </span>
                    {note}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <FeatureCard
          icon={Clock3}
          title="Verification-Aware Monitoring"
          text="Pending, verifying, confirmed outage, and recovery states are separated so Sentrovia does not overreact to the first failure."
          accent="border-l-orange-500"
        />
        <FeatureCard
          icon={Radar}
          title="Worker Insights"
          text="Backlog, cycle duration, failing monitors, and worker-level errors stay visible in a dedicated dashboard instead of hiding behind generic health badges."
          accent="border-l-emerald-500"
        />
        <FeatureCard
          icon={Sparkles}
          title="Operationally Readable"
          text="Logs, timelines, delivery history, and dashboards read from the same durable store, which keeps the console consistent under load."
          accent="border-l-violet-500"
        />
      </section>

      <Tabs defaultValue={helpCategories[0]?.value} className="flex-col gap-6">
        <TabsList variant="line" className="w-fit max-w-full justify-start overflow-x-auto rounded-2xl border bg-card p-2">
          {helpCategories.map((category) => (
            <TabsTrigger key={category.value} value={category.value} className="flex-none rounded-xl px-4">
              <category.icon data-icon="inline-start" />
              {category.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {helpCategories.map((category) => (
          <TabsContent key={category.value} value={category.value}>
            <HelpFaqPanel category={category} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  text,
  accent,
}: {
  icon: ElementType;
  title: string;
  text: string;
  accent: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className={`border-l-2 ${accent} px-5 py-5`}>
        <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border bg-background">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-base font-semibold tracking-tight">{title}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}
