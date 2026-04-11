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
  Radar,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const overviewCards = [
  {
    title: "Worker-driven runtime",
    description:
      "Checks run in a dedicated worker, not in the browser. The worker owns due-monitor selection, execution, verification, report delivery, and outbound channel decisions.",
    icon: ServerCog,
    accent: "border-l-sky-500",
  },
  {
    title: "Database-first state model",
    description:
      "PostgreSQL stores monitor configuration, checks, events, worker heartbeat, worker metrics, members, companies, delivery history, settings, and report schedules as the durable source of truth.",
    icon: Database,
    accent: "border-l-emerald-500",
  },
  {
    title: "Operator-facing control plane",
    description:
      "The Next.js console focuses on visibility and configuration: dashboards, worker insights, monitoring, reports, members, settings, and delivery tooling.",
    icon: LayoutDashboard,
    accent: "border-l-violet-500",
  },
];

const runtimeFlow = [
  {
    title: "Operators save monitoring intent in the web console",
    body: "Monitor definitions, defaults, report schedules, companies, members, and delivery settings enter the system through authenticated Next.js route handlers.",
    icon: Workflow,
  },
  {
    title: "Validation normalizes each payload before persistence",
    body: "Zod validates input, settings defaults fill safe gaps, and Drizzle persists the resulting records into PostgreSQL.",
    icon: Boxes,
  },
  {
    title: "The worker polls for due work",
    body: "On each cycle the worker finds active monitors and report schedules whose next run is due, applies batch and concurrency rules, and claims work safely.",
    icon: ServerCog,
  },
  {
    title: "Type-specific probes run from stored monitor settings",
    body: "HTTP, keyword, JSON, port, PostgreSQL, ping, and heartbeat checks all read their behavior directly from persisted monitor rows rather than from browser state.",
    icon: Globe,
  },
  {
    title: "Verification mode filters transient failures",
    body: "A first failure does not immediately become a confirmed outage. Sentrovia schedules one-minute confirmation checks and only escalates once the threshold is met.",
    icon: ShieldCheck,
  },
  {
    title: "Delivery and reporting are routed from the worker",
    body: "When a confirmed state change or due report requires outbound work, Sentrovia renders templates, resolves recipients, and records per-channel outcomes.",
    icon: BellRing,
  },
  {
    title: "Telemetry is written back for every product surface",
    body: "Status, latency, timestamps, worker heartbeat, cycle metrics, delivery outcomes, and report schedule state are written into PostgreSQL so every screen reads the same reality.",
    icon: Gauge,
  },
];

const stackSections = [
  {
    title: "Application Layer",
    items: [
      "Next.js 16 App Router for pages and authenticated APIs",
      "React 19 for client interactivity on monitoring, worker insights, delivery, reports, and settings",
      "TypeScript across the console, worker, schemas, services, and report generation",
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
    title: "Operational Features",
    items: [
      "Dedicated Node worker process for checks, retries, and scheduled reports",
      "Worker observability dashboard for backlog, cycle, and runtime error insight",
      "Monitoring as Code, CSV import, company grouping, and delivery history",
    ],
  },
  {
    title: "Deployment and Runtime",
    items: [
      "Docker Compose for db + web + worker orchestration",
      "GitHub version awareness for update checks",
      "Heartbeat-backed worker visibility instead of UI simulation",
    ],
  },
];

const apiGroups = [
  {
    title: "Configuration APIs",
    routes: ["/api/settings", "/api/companies", "/api/members", "/api/app-update"],
    description:
      "These routes persist operator intent: defaults, update configuration, companies, members, and workspace behavior.",
  },
  {
    title: "Monitoring APIs",
    routes: ["/api/monitors", "/api/monitors/[id]", "/api/monitors/bulk", "/api/monitors/import", "/api/monitors/heartbeat/[token]"],
    description:
      "These routes create and manage monitors, import structured input, expose heartbeat endpoints, and persist runtime-affecting monitoring settings.",
  },
  {
    title: "Visibility APIs",
    routes: ["/api/logs", "/api/dashboard/stream", "/api/worker", "/api/system"],
    description:
      "These routes power worker state, live dashboard updates, system telemetry, and operator-facing runtime visibility.",
  },
  {
    title: "Delivery and Reporting APIs",
    routes: ["/api/delivery", "/api/delivery/test", "/api/delivery/retry", "/api/reports", "/api/reports/preview", "/api/reports/send"],
    description:
      "These routes handle delivery history, test sends, retries, scheduled reports, and report previews or dispatch.",
  },
];

const implementationNotes = [
  "Workspace defaults are active behavior, not cosmetic preferences. They feed create, import, and update fallback chains.",
  "Verification mode exists to confirm instability before delivery begins, which keeps alerting calmer under transient failures.",
  "Worker heartbeat and cycle metrics live in the database so the console can distinguish a healthy UI from a stale monitoring engine.",
  "Reports are part of the product runtime now, not a side export. The worker can pick up due schedules and send them like any other operational task.",
  "Update awareness is opt-in and version-based. Detection is broad, but automatic apply stays intentionally conservative.",
];

const updateModel = [
  {
    title: "Version source",
    body: "Sentrovia reads the running package version, then compares it to package.json in a configured GitHub repository branch.",
  },
  {
    title: "Configuration source",
    body: "The update repository can be supplied from Settings or environment variables, which makes self-hosted setups easier to standardize.",
  },
  {
    title: "Apply behavior",
    body: "In-place update only works when the runtime has a writable git checkout. Docker deployments usually detect updates but still require a host-level rebuild flow.",
  },
];

const productSurfaces = [
  "Monitoring dashboard with live runtime and company health",
  "Worker Insights dashboard with backlog, cycle, and error visibility",
  "Reports center with preview studio and schedule manager",
  "Delivery console for testing, retrying, and auditing outbound channels",
  "Members, companies, and settings for workspace operations",
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
                  Sentrovia is a worker-driven monitoring platform built for durable state, clear operator visibility, and low-drama alerting
                </h1>
                <p className="max-w-4xl text-sm leading-7 text-muted-foreground md:text-[15px]">
                  The browser configures the system and reads results. The worker executes checks, confirmation
                  logic, report schedules, and outbound delivery. PostgreSQL keeps everything aligned so dashboards,
                  logs, delivery, reports, and update awareness all reflect the same stored truth.
                </p>
              </div>
            </div>

            <Card className="overflow-hidden border-border/70 bg-background/90 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Product shape in one view</CardTitle>
                <CardDescription>
                  Three services, one durable state layer, and distinct surfaces for operators.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <MetricCard label="Services" value="3" detail="db + web + worker" />
                <MetricCard label="Monitor Types" value="7" detail="http to heartbeat" />
                <MetricCard label="Reports" value="Built-in" detail="preview + scheduled send" />
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

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Current product surfaces</CardTitle>
            <CardDescription>
              These are the operator-facing areas that define the current product shape.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {productSurfaces.map((item) => (
              <div key={item} className="rounded-2xl border bg-muted/[0.06] px-4 py-3 text-sm leading-6 text-muted-foreground">
                {item}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">What changed recently</CardTitle>
            <CardDescription>
              Sentrovia now includes newer operational surfaces that reshape how teams use it day to day.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <MetricCard label="Worker Insights" value="Live" detail="backlog, cycles, failures, errors" />
            <MetricCard label="Reports" value="Expanded" detail="preview studio + schedule manager" />
            <MetricCard label="Update Center" value="Configurable" detail="settings or env based GitHub checks" />
            <MetricCard label="Heartbeat" value="Built-in" detail="cron or job monitoring endpoint" />
          </CardContent>
        </Card>
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
            <Radar data-icon="inline-start" />
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
              <CardTitle>How the runtime works end to end</CardTitle>
              <CardDescription>
                From operator input to worker execution, persisted telemetry, and outbound delivery.
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
                  Sentrovia is easier to trust because the UI, worker, and database each have a clear job.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
                <p>
                  The web console is the control plane. It is where operators configure monitors, manage members,
                  inspect worker health, review delivery history, and work with reports.
                </p>
                <p>
                  The worker is the execution engine. It decides what should run next, how a check should be built,
                  whether a failure is real or still unconfirmed, and when reports or notifications should be sent.
                </p>
                <p>
                  PostgreSQL keeps those two layers aligned. If the worker stalls, the console can still show that
                  staleness. If the browser refreshes, operators still read the same durable state written by the worker.
                </p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>Implementation notes that shape operator expectations</CardTitle>
                <CardDescription>
                  These product rules change behavior in production and are worth understanding.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {implementationNotes.map((note) => (
                  <div key={note} className="rounded-2xl border bg-muted/[0.06] px-4 py-3 text-sm leading-6 text-muted-foreground">
                    {note}
                  </div>
                ))}
                <Separator />
                <p className="text-sm leading-7 text-muted-foreground">
                  This page is intended to stay aligned with the actual shipped system. When runtime behavior changes,
                  this documentation should change with it.
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
                  The update card is designed for self-hosted teams that want the console to notice when the repository moves ahead.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
                <p>
                  Update awareness is version-based. Sentrovia reads the running package version and compares it against
                  package.json in a configured GitHub branch. The most reliable release signal is still a real version bump.
                </p>
                <p>
                  Configuration can come from Settings or from environment variables. That makes it possible to support both
                  local Docker users and more controlled self-hosted deployments with the same product surface.
                </p>
                <p>
                  The Update button stays conservative by design. Docker deployments can detect a newer version, but they
                  usually still need a host-level `git pull` plus rebuild flow rather than an in-place app-side patch.
                </p>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>Update model</CardTitle>
                <CardDescription>
                  These layers explain why detection is broad but automatic apply remains intentionally narrow.
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
