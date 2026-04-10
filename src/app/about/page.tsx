import type { ElementType } from "react";
import {
  ArrowUpRight,
  BellRing,
  Boxes,
  Database,
  Gauge,
  Globe,
  Layers3,
  LayoutDashboard,
  Mail,
  ShieldAlert,
  ServerCog,
  Settings2,
  ShieldCheck,
  RefreshCw,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const overviewCards = [
  {
    title: "Separate Worker Runtime",
    description:
      "Checks are not executed in the browser. A dedicated worker owns due-monitor selection, request execution, verification mode, and outbound delivery decisions.",
    icon: ServerCog,
    accent: "border-l-sky-500",
  },
  {
    title: "Database-First State Model",
    description:
      "PostgreSQL stores monitor configuration, checks, events, worker heartbeat, companies, members, delivery history, and workspace defaults as the single source of truth.",
    icon: Database,
    accent: "border-l-emerald-500",
  },
  {
    title: "Operational Console",
    description:
      "The Next.js web console is responsible for visibility and configuration: monitors, settings, logs, delivery testing, company rollups, members, and operator workflows.",
    icon: LayoutDashboard,
    accent: "border-l-violet-500",
  },
];

const runtimeFlow = [
  {
    title: "An operator configures intent in the web console",
    body: "Monitor definitions, defaults, templates, companies, and delivery settings all enter the system through authenticated route handlers in the Next.js application.",
    icon: Settings2,
  },
  {
    title: "Validation normalizes every payload before persistence",
    body: "Zod validates incoming payloads, settings defaults fill optional monitor gaps where appropriate, and Drizzle persists the resulting data into PostgreSQL.",
    icon: Workflow,
  },
  {
    title: "The worker polls for due monitors",
    body: "On each cycle the worker finds active monitors whose nextCheckAt is due, applies per-workspace batch size, and queues them for concurrency-limited execution.",
    icon: ServerCog,
  },
  {
    title: "Each request is built from saved monitor settings",
    body: "Method, timeout, redirects, SSL behavior, response limits, and verification threshold are loaded directly from the monitor row rather than from ad hoc runtime assumptions.",
    icon: Globe,
  },
  {
    title: "Verification mode filters out noisy first failures",
    body: "A first failure does not immediately trigger a real outage. Sentrovia schedules one-minute confirmation checks and only opens the incident after the configured threshold is reached.",
    icon: ShieldCheck,
  },
  {
    title: "Notifications pass through routing logic",
    body: "When delivery proceeds, Sentrovia renders templates, resolves recipients, and attempts enabled channels.",
    icon: BellRing,
  },
  {
    title: "Results are written back for every surface to read",
    body: "Status, code, latency, timestamps, check history, events, worker state, and delivery outcomes are written into PostgreSQL so dashboard, logs, and reports stay consistent.",
    icon: Gauge,
  },
];

const stackSections = [
  {
    title: "Application Layer",
    items: [
      "Next.js 16 App Router for pages and authenticated route handlers",
      "React 19 for client-side interactivity on monitoring, logs, settings, delivery, and profile flows",
      "TypeScript across the web console, worker logic, schemas, and services",
    ],
  },
  {
    title: "Data and Validation",
    items: [
      "PostgreSQL as the durable system of record",
      "Drizzle ORM for schema and query access",
      "Zod for request validation and payload normalization",
    ],
  },
  {
    title: "State and Delivery",
    items: [
      "Zustand for focused client-side page state",
      "Nodemailer for SMTP delivery and attachment sending",
      "Fetch-based integrations for Telegram, Discord, and generic webhooks",
    ],
  },
  {
    title: "Runtime and Operations",
    items: [
      "A dedicated Node worker process for monitoring execution",
      "Docker Compose for db + web + worker orchestration",
      "Heartbeat-backed worker visibility rather than UI simulation",
    ],
  },
];

const apiGroups = [
  {
    title: "Configuration APIs",
    routes: ["/api/settings", "/api/companies", "/api/members"],
    description:
      "These routes persist operator intent: profile data, defaults, delivery configuration, companies, members, and workspace-level behavior.",
  },
  {
    title: "Monitoring APIs",
    routes: ["/api/monitors", "/api/monitors/[id]", "/api/monitors/bulk", "/api/monitors/import"],
    description:
      "These routes create and manage monitors, import structured CSV input, expose monitor history, and persist runtime-affecting monitor settings.",
  },
  {
    title: "Visibility APIs",
    routes: ["/api/logs", "/api/dashboard/stream", "/api/worker"],
    description:
      "These routes expose worker health, live dashboard updates, and event data that operators consume while making operational decisions.",
  },
  {
    title: "Delivery APIs",
    routes: ["/api/delivery", "/api/delivery/test", "/api/delivery/retry"],
    description:
      "These routes power delivery history, smoke tests, retry workflows, and channel-level troubleshooting without changing monitor state.",
  },
];

const implementationNotes = [
  "Default monitor settings are active behavior, not decorative preferences. They feed create, import, and update fallback chains.",
  "Verification mode sits between first failure and confirmed incident so alerting reflects confirmed instability, not a single transient error.",
  "Worker heartbeat is stored in the database so the console can distinguish a healthy UI from a stalled monitoring engine.",
  "Delivery history exists because knowing that an event happened is not enough; operators also need to know what the system attempted after that event.",
  "Version awareness is opt-in and driven by GitHub package version checks. Automatic apply is only available when the runtime has a writable git checkout.",
];

const updateModel = [
  {
    title: "Version source",
    body: "Sentrovia reads the local package version, then compares it to package.json in a configured GitHub repository branch. A newer remote version triggers an in-app update banner.",
  },
  {
    title: "Operator experience",
    body: "When a newer version exists, the console surfaces a small top-right update card with the current version, remote version, and a direct action for supported runtimes.",
  },
  {
    title: "Automatic apply rules",
    body: "In-place update only works if the app is running from a writable git checkout and git is available. Docker deployments usually detect updates but still require a host-level rebuild flow.",
  },
];

export default function AboutPage() {
  return (
    <div className="flex w-full flex-col gap-8 animate-in fade-in duration-300">
      <section className="overflow-hidden rounded-3xl border bg-card">
        <div className="bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_30%),radial-gradient(circle_at_top_right,rgba(139,92,246,0.12),transparent_32%)] px-6 py-8 md:px-8 lg:px-10 lg:py-10">
          <div className="grid gap-6 xl:grid-cols-[1.14fr_0.86fr] xl:items-end">
            <div className="space-y-4">
              <Badge variant="outline" className="border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300">
                About Sentrovia
              </Badge>
              <div className="space-y-3">
                <h1 className="max-w-5xl text-3xl font-semibold tracking-tight md:text-4xl xl:text-[3rem] xl:leading-[1.04]">
                  Sentrovia is a worker-driven monitoring platform built around durable state, verification-aware alerts, and operator visibility
                </h1>
                <p className="max-w-4xl text-sm leading-7 text-muted-foreground md:text-[15px]">
                  The browser configures the platform and reads results. The worker executes monitoring,
                  confirmation checks, delivery decisions, and monitor-type
                  specific probes. PostgreSQL keeps everything consistent so dashboards, logs, timelines,
                  reports, and version awareness all reflect the same stored reality.
                </p>
              </div>
            </div>

            <Card className="overflow-hidden border-border/70 bg-background/90 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Product shape in one view</CardTitle>
                <CardDescription>
                  Three services, one source of truth, and a deliberate split between control plane and execution engine.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <MetricCard label="Services" value="3" detail="db + web + worker" />
                <MetricCard label="Runtime" value="Async" detail="batch + concurrency control" />
                <MetricCard label="State Model" value="DB" detail="durable operational telemetry" />
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {overviewCards.map((card) => (
          <Card key={card.title} className="overflow-hidden">
            <CardContent className={`${card.accent} border-l-2 px-5 py-5`}>
              <div className="mb-4 flex size-11 items-center justify-center rounded-2xl border bg-background">
                <card.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-base font-semibold tracking-tight">{card.title}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Tabs defaultValue="runtime" className="flex-col gap-6">
        <TabsList variant="line" className="w-fit max-w-full justify-start overflow-x-auto rounded-2xl border bg-card p-2">
          <TabsTrigger value="runtime" className="flex-none rounded-xl px-4">
            <Workflow data-icon="inline-start" />
            Runtime Flow
          </TabsTrigger>
          <TabsTrigger value="stack" className="flex-none rounded-xl px-4">
            <Layers3 data-icon="inline-start" />
            Tech Stack
          </TabsTrigger>
          <TabsTrigger value="api" className="flex-none rounded-xl px-4">
            <Boxes data-icon="inline-start" />
            API Shape
          </TabsTrigger>
          <TabsTrigger value="notes" className="flex-none rounded-xl px-4">
            <Mail data-icon="inline-start" />
            Design Notes
          </TabsTrigger>
          <TabsTrigger value="updates" className="flex-none rounded-xl px-4">
            <RefreshCw data-icon="inline-start" />
            Updates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="runtime">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>How the monitoring runtime actually works</CardTitle>
              <CardDescription>
                This is the real end-to-end execution path from browser input to stored check result and outbound delivery attempt.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              {runtimeFlow.map((step, index) => (
                <RuntimeStep key={step.title} index={index + 1} icon={step.icon} title={step.title} body={step.body} />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stack">
          <div className="grid gap-4 lg:grid-cols-2">
            {stackSections.map((section) => (
              <Card key={section.title} className="overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-base">{section.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {section.items.map((item) => (
                    <div key={item} className="rounded-2xl border bg-muted/[0.06] px-4 py-3 text-sm leading-6 text-muted-foreground">
                      {item}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="api">
          <div className="grid gap-4 lg:grid-cols-2">
            {apiGroups.map((group) => (
              <Card key={group.title} className="overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-base">{group.title}</CardTitle>
                  <CardDescription>{group.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {group.routes.map((route) => (
                    <div key={route} className="rounded-2xl border bg-muted/[0.06] px-4 py-3">
                      <code className="text-sm">{route}</code>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="notes">
          <div className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>Why the separation of concerns matters</CardTitle>
                <CardDescription>
                  Sentrovia is easier to trust because the layers do different jobs and report on each other clearly.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
                <p>
                  The web console is the control plane. It is where operators configure intent, read
                  results, review delivery history, manage settings, and inspect worker health.
                </p>
                <p>
                  The worker is the execution engine. It decides what should be checked next, how the
                  request should be built, whether a failure is real or still unconfirmed, and whether an
                  alert should be suppressed, retried, mirrored, or delivered.
                </p>
                <p>
                  PostgreSQL keeps those two layers aligned. If the worker stalls, the console can still
                  show that staleness. If the UI is refreshed, operators still see the same stored state
                  that the worker wrote a moment earlier.
                </p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>Implementation notes that shape operator expectations</CardTitle>
                <CardDescription>
                  These product rules change how the platform behaves in production and are worth knowing.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {implementationNotes.map((note) => (
                  <div key={note} className="rounded-2xl border bg-muted/[0.06] px-4 py-3 text-sm leading-6 text-muted-foreground">
                    <ShieldAlert className="mr-2 inline h-4 w-4 text-primary/80" />
                    {note}
                  </div>
                ))}
                <Separator />
                <p className="text-sm leading-7 text-muted-foreground">
                  When the platform changes in a way that affects execution flow, delivery routing, or the
                  data model, this page should change too. It is intended to stay aligned with the actual
                  system, not become stale marketing copy.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="updates">
          <div className="grid gap-6 xl:grid-cols-[0.98fr_1.02fr]">
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>How GitHub update awareness works</CardTitle>
                <CardDescription>
                  The banner is designed for self-hosted teams that want the console to notice when the repository moves ahead.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
                <p>
                  Update awareness is version-based. Sentrovia reads the running package version from the
                  local deployment and compares it against the package version in a configured GitHub
                  repository branch. That means the most reliable release signal is a real version bump in
                  package.json when you push application changes.
                </p>
                <p>
                  This design keeps the check simple and public-repo friendly. It avoids requiring a
                  private GitHub token just to learn whether a newer build exists, while still giving
                  operators a visible signal inside the product itself.
                </p>
                <p>
                  The Update button is intentionally conservative. Sentrovia only attempts an in-place pull
                  when it can prove the runtime is backed by a writable git checkout. In Docker or packaged
                  deployments, the banner still appears, but the host usually needs a manual rebuild flow.
                </p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>Update model</CardTitle>
                <CardDescription>
                  These three layers explain why detection is broad but automatic apply remains intentionally narrow.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {updateModel.map((item) => (
                  <div key={item.title} className="rounded-2xl border bg-muted/[0.06] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ArrowUpRight className="h-4 w-4 text-primary/80" />
                      <p className="text-sm font-medium">{item.title}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border bg-muted/[0.06] px-4 py-4">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function RuntimeStep({
  index,
  icon: Icon,
  title,
  body,
}: {
  index: number;
  icon: ElementType;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border bg-muted/[0.04] px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-2xl border bg-background">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Step {index}
            </span>
            <p className="text-sm font-medium">{title}</p>
          </div>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">{body}</p>
        </div>
      </div>
    </div>
  );
}

