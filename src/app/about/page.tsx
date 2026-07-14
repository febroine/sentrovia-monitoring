import type { ElementType } from "react";
import {
  BellRing,
  Boxes,
  Database,
  FileText,
  Gauge,
  Globe,
  Layers3,
  LayoutDashboard,
  Radar,
  ServerCog,
  ShieldCheck,
  Workflow,
} from "lucide-react";
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
      "The Next.js console focuses on visibility and configuration: dashboards, worker insights, monitoring, HTML reports, members, settings, guided updates, help, and delivery tooling.",
    icon: LayoutDashboard,
    accent: "border-l-violet-500",
  },
];

const runtimeFlow = [
  {
    title: "Operators save monitoring intent in the web console",
    body: "Monitor definitions, defaults, report schedules, companies, members, notification language, and delivery settings enter the system through authenticated Next.js route handlers.",
    icon: Workflow,
  },
  {
    title: "Validation normalizes each payload before persistence",
    body: "Zod validates structure, network safety rules reject sensitive host-local targets, and Drizzle persists the result. A valid hostname can be saved before DNS exists so the worker can monitor DNS recovery as part of availability.",
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
    body: "A first failure does not immediately become a confirmed outage. Sentrovia schedules confirmation checks, treats hard timeouts as availability failures, and keeps slow-but-successful responses online as degraded latency signals.",
    icon: ShieldCheck,
  },
  {
    title: "Delivery and reporting are routed from the worker",
    body: "When a confirmed state change, latency warning, or due report requires outbound work, Sentrovia renders templates, resolves recipients, sends HTML reports, and records per-channel outcomes.",
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
      "HTML-only reports, notification language selection, CSV monitor import, company grouping, and delivery history",
    ],
  },
  {
    title: "Deployment and Runtime",
    items: [
      "Docker Compose for db + web + worker orchestration",
      "Serialized schema synchronization with an applied-migration ledger",
      "First-run admin onboarding, stable environment secrets, rollback-aware NSSM updates, and guided GitHub Release commands",
    ],
  },
];

const apiGroups = [
  {
    title: "Authentication and Workspace APIs",
    routes: ["/api/auth/onboarding", "/api/auth/login", "/api/auth/session", "/api/members"],
    description:
      "These routes handle first-admin onboarding, login-only access after setup, session refresh, and admin-managed member operations.",
  },
  {
    title: "Configuration APIs",
    routes: ["/api/settings", "/api/companies", "/api/updates"],
    description:
      "These routes persist operator intent and expose safe operational guidance: defaults, companies, workspace behavior, and GitHub Release update metadata.",
  },
  {
    title: "Monitoring APIs",
    routes: ["/api/monitors", "/api/monitors/[id]", "/api/monitors/bulk", "/api/monitors/import", "/api/monitors/heartbeat/[token]"],
    description:
      "These routes create and manage monitors, accept valid targets before DNS exists, expose heartbeat endpoints, and persist runtime-affecting monitoring settings.",
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
  "Verification mode exists to confirm instability before outage delivery begins; slow successful responses stay online and notify as latency only after repeated slow checks.",
  "DNS resolution is runtime availability, not a creation prerequisite. Unresolved hostnames can be stored and later recover without monitor reconfiguration.",
  "Worker heartbeat and cycle metrics live in the database so the console can distinguish a healthy UI from a stale monitoring engine.",
  "Reports are part of the product runtime now. The worker sends one readable HTML report instead of CSV, XLSX, and PDF export bundles.",
  "Settings cards can save their own operational group while still using the same validated settings API behind the scenes.",
  "The update assistant is intentionally guided: it shows GitHub Release data and host-side commands, but the browser never rewrites the running application.",
];

const productSurfaces = [
  "Monitoring dashboard with live runtime and company health",
  "Worker Insights dashboard with backlog, cycle, and error visibility",
  "Reports center with preview studio, schedule manager, and HTML report delivery",
  "Delivery console for testing, retrying, auditing outbound channels, and validating templates",
  "Members, companies, settings cards, confirmed destructive actions, and guided updates for workspace operations",
];

const workerDeepDive = [
  {
    title: "How the worker starts its cycle",
    body:
      "On every poll the worker asks PostgreSQL which monitors are due, respects workspace batch size, applies lease-based claiming, and marks the current cycle in worker state so the UI can show live heartbeat and cycle timing.",
    icon: ServerCog,
  },
  {
    title: "How verification mode prevents noisy alerts",
    body:
      "A first failure does not immediately become a confirmed outage. The worker can move the monitor into verification mode, run one-minute confirmation checks, and only send the first down notification after the retry threshold is met.",
    icon: ShieldCheck,
  },
  {
    title: "How prolonged downtime reminders work",
    body:
      "Once an outage is confirmed, the worker keeps checking on the normal interval. If the monitor is still down after the configured reminder window, it can send a repeated 'still down' notification using a separate reminder template set.",
    icon: BellRing,
  },
  {
    title: "How recovery is detected",
    body:
      "If a monitor previously had a confirmed down state and later returns healthy, the worker writes a recovery event and sends a recovery notification once. This creates a clean down-to-up lifecycle instead of repeated duplicate recoveries.",
    icon: Gauge,
  },
];

const databaseDeepDive = [
  {
    title: "Configuration records",
    body:
      "The database stores users, companies, monitor definitions, notification preferences, template defaults, delivery endpoints, and report schedules. The browser writes intent here and the worker reads from it.",
  },
  {
    title: "Runtime records",
    body:
      "Every executed check can write monitor status, status code, latency, last success time, last failure start, next due time, verification counters, worker heartbeat, cycle summaries, and delivery outcomes back into PostgreSQL.",
  },
  {
    title: "Why durable state matters",
    body:
      "Because the worker and web console share the same persisted state, dashboards, reports, delivery history, and worker insights all read the same reality. A page refresh does not lose operational truth, and a stale worker is visible as stale data rather than hidden by the UI.",
  },
];

const reportsDeepDive = [
  {
    title: "How reports are built",
    body:
      "Reports are generated from persisted monitor checks, monitor URLs, latency samples, failure events, and company relationships. The reports center can preview weekly, monthly, company-scoped, and global workspace summaries before sending them.",
  },
  {
    title: "How schedules run",
    body:
      "Scheduled reports live in the database with cadence, recipients, scope, and next-run time. The worker picks up due schedules during its cycle, generates one browser-ready HTML attachment, sends it, and updates the schedule status.",
  },
  {
    title: "What the report intentionally leaves out",
    body:
      "The report avoids CSV, XLSX, PDF, status-code tables, and check-count labels so recipients receive one readable operational summary instead of several overlapping exports.",
  },
];

const notificationDeepDive = [
  {
    title: "Outbound channels",
    body:
      "Sentrovia supports SMTP email, Telegram, Discord webhook, and generic webhook delivery. Each delivery attempt is persisted so operators can audit success, failure, retry state, and destination history.",
  },
  {
    title: "Template model",
    body:
      "The app has workspace-level default templates for email and Telegram in English or Turkish, while monitors can still override their own subject/body when needed. Prolonged downtime reminders have their own dedicated template fields as well.",
  },
  {
    title: "Delivery decision flow",
    body:
      "The worker decides whether an event should notify at all, applies dedup rules, respects per-monitor channel preferences, renders the final message in the configured language, and only then dispatches through the enabled channel integrations.",
  },
];

const monitorTypeGuide = [
  {
    title: "HTTP / HTTPS",
    body: "Runs full web requests with method, timeout, redirects, SSL behavior, response size limits, and optional status-code rules. The target can be saved before DNS exists; unresolved DNS is then tracked as an availability failure.",
  },
  {
    title: "Keyword",
    body: "Fetches the target page and checks whether the configured keyword or phrase is present, which is useful when a page can return 200 while still being functionally broken.",
  },
  {
    title: "JSON Assertion",
    body: "Requests an HTTP endpoint and validates a JSON path against an expected value or existence rule, which is useful for APIs and machine-readable health checks.",
  },
  {
    title: "TCP / Port",
    body: "Checks raw socket reachability against a host and port without relying on HTTP semantics.",
  },
  {
    title: "PostgreSQL",
    body: "Tests database connectivity directly against the configured host, port, database name, username, and SSL preference.",
  },
  {
    title: "Ping / ICMP",
    body: "Uses ICMP reachability checks to verify that a host is alive at the network layer, which is useful for servers, gateways, and internal infrastructure.",
  },
  {
    title: "Cron / Heartbeat",
    body: "Creates a unique heartbeat endpoint that an external cron job or scheduler can call. If the heartbeat stops arriving on time, the worker turns that into a down condition.",
  },
];

export default function AboutPage() {
  return (
    <div className="flex w-full flex-col gap-8 animate-in fade-in duration-300">
      <header className="grid gap-6 border-b pb-8 xl:grid-cols-[1.35fr_0.65fr] xl:items-end">
        <div>
          <h1 className="mb-2 text-2xl font-semibold tracking-tight">Sentrovia</h1>
          <p className="max-w-4xl text-sm leading-7 text-muted-foreground">
            A worker-driven monitoring platform built around durable state and clear operator visibility. The web
            console manages intent, the worker executes checks and delivery, and PostgreSQL keeps every surface aligned.
          </p>
        </div>
        <dl className="grid grid-cols-3 divide-x border-y py-3 text-center">
          <ProductFact label="Services" value="3" />
          <ProductFact label="Monitor types" value="7" />
          <ProductFact label="Report format" value="HTML" />
        </dl>
      </header>

      <section className="grid border-y lg:grid-cols-3 lg:divide-x">
        {overviewCards.map((card) => (
          <div key={card.title} className="py-5 lg:px-5 lg:first:pl-0 lg:last:pr-0">
            <card.icon className="h-4 w-4 text-muted-foreground" />
            <h2 className="mt-3 text-base font-semibold">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-8 xl:grid-cols-2">
        <div>
          <h2 className="text-base font-semibold">Product surfaces</h2>
          <p className="mt-1 text-sm text-muted-foreground">The operator-facing areas in the current release.</p>
          <div className="mt-4 divide-y border-y">
            {productSurfaces.map((item) => (
              <p key={item} className="py-3 text-sm leading-6 text-muted-foreground">{item}</p>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold">Current capabilities</h2>
          <p className="mt-1 text-sm text-muted-foreground">Key workflows available to workspace administrators.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MetricCard label="Worker Insights" value="Live" detail="backlog, cycles, failures, errors" />
            <MetricCard label="Reports" value="HTML Only" detail="preview, schedule, one readable attachment" />
            <MetricCard label="Onboarding" value="Admin First" detail="first account becomes workspace admin" />
            <MetricCard label="Updates" value="Guarded" detail="build validation, migrations, rollback" />
          </div>
        </div>
      </section>

      <Tabs defaultValue="runtime" className="flex-col gap-6">
        <TabsList variant="line" className="w-fit max-w-full justify-start overflow-x-auto rounded-lg border bg-card p-1">
          <TabsTrigger value="runtime" className="flex-none rounded-md px-3">
            <Workflow data-icon="inline-start" />
            Runtime Flow
          </TabsTrigger>
          <TabsTrigger value="stack" className="flex-none rounded-md px-3">
            <Layers3 data-icon="inline-start" />
            Tech Stack
          </TabsTrigger>
          <TabsTrigger value="api" className="flex-none rounded-md px-3">
            <Boxes data-icon="inline-start" />
            API Shape
          </TabsTrigger>
          <TabsTrigger value="notes" className="flex-none rounded-md px-3">
            <Radar data-icon="inline-start" />
            Design Notes
          </TabsTrigger>
          <TabsTrigger value="worker" className="flex-none rounded-md px-3">
            <ServerCog data-icon="inline-start" />
            Worker Deep Dive
          </TabsTrigger>
          <TabsTrigger value="database" className="flex-none rounded-md px-3">
            <Database data-icon="inline-start" />
            Database Model
          </TabsTrigger>
          <TabsTrigger value="reports" className="flex-none rounded-md px-3">
            <FileText data-icon="inline-start" />
            Reports
          </TabsTrigger>
          <TabsTrigger value="delivery" className="flex-none rounded-md px-3">
            <BellRing data-icon="inline-start" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="monitors" className="flex-none rounded-md px-3">
            <Globe data-icon="inline-start" />
            Monitor Types
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
                    <div key={item} className="rounded-lg border bg-muted/[0.06] px-4 py-3 text-sm leading-6 text-muted-foreground">
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
                    <div key={route} className="rounded-lg border bg-muted/[0.06] px-4 py-3">
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
                  <div key={note} className="rounded-lg border bg-muted/[0.06] px-4 py-3 text-sm leading-6 text-muted-foreground">
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

        <TabsContent value="worker">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>How the worker actually behaves</CardTitle>
              <CardDescription>
                This is the execution layer of Sentrovia. It owns checks, verification, recovery, reminders, and scheduled report work.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              {workerDeepDive.map((item, index) => (
                <RuntimeStep key={item.title} index={index + 1} icon={item.icon} title={item.title} body={item.body} />
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="database">
          <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>What the database stores</CardTitle>
                <CardDescription>
                  PostgreSQL is the durable source of truth for both configuration and runtime telemetry.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {databaseDeepDive.map((item) => (
                  <DetailBlock key={item.title} title={item.title} body={item.body} />
                ))}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>Main state buckets</CardTitle>
                <CardDescription>
                  These are the product areas that persist into the database and feed the visible UI.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <MetricCard label="Users" value="Profiles" detail="members, auth identity, workspace profile" />
                <MetricCard label="Monitors" value="Config + Runtime" detail="definitions, status, timing, verification" />
                <MetricCard label="History" value="Checks + Events" detail="timelines, logs, RCA summaries, delivery" />
                <MetricCard label="Worker" value="Pulse + Cycles" detail="heartbeat, last cycle, backlog, recent errors" />
                <MetricCard label="Reports" value="Schedules" detail="cadence, recipients, next run, delivery status" />
                <MetricCard label="Settings" value="Live Behavior" detail="templates, defaults, alert rules, backup policy" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reports">
          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>How reports work</CardTitle>
                <CardDescription>
                  Reports are now part of the runtime, not just a one-off export button.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {reportsDeepDive.map((item) => (
                  <DetailBlock key={item.title} title={item.title} body={item.body} />
                ))}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>Reports center responsibilities</CardTitle>
                <CardDescription>
                  The reports UI is responsible for authoring, previewing, and operating scheduled summaries.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <DetailBlock
                  title="Preview studio"
                  body="Lets operators inspect a report before it is sent so the report feels like a real operational deliverable, not a blind background job."
                />
                <DetailBlock
                  title="Schedule manager"
                  body="Stores recurring report jobs with cadence, recipient list, company scope, and next-run state so the worker can pick them up later."
                />
                <DetailBlock
                  title="Manual send flow"
                  body="Supports immediate delivery when someone wants to send a weekly or monthly summary right now without waiting for the next scheduled run."
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="delivery">
          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>How notifications are decided</CardTitle>
                <CardDescription>
                  Delivery is more than just sending text. The worker applies rules before any channel is called.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {notificationDeepDive.map((item) => (
                  <DetailBlock key={item.title} title={item.title} body={item.body} />
                ))}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>Notification lifecycle</CardTitle>
                <CardDescription>
                  The same general pipeline applies to down, recovery, latency, SSL, and prolonged downtime events.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <DetailBlock
                  title="1. Event is produced"
                  body="The worker confirms a monitor outcome such as failure, recovery, latency threshold, SSL warning, status change, or still-down reminder."
                />
                <DetailBlock
                  title="2. Rules are evaluated"
                  body="Workspace settings decide whether that event type should notify, whether dedup should suppress it, and whether status-code filtering applies."
                />
                <DetailBlock
                  title="3. Templates are rendered"
                  body="The worker resolves workspace defaults or monitor-level overrides, fills tokens like domain, status code, RCA summary, and downtime duration, then prepares channel-specific output."
                />
                <DetailBlock
                  title="4. Delivery is persisted"
                  body="Every send attempt writes back into delivery history so operators can audit what happened, retry webhooks, and confirm whether a message actually left the system."
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="monitors">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Monitor types explained</CardTitle>
              <CardDescription>
                Each monitor type shares the same worker pipeline, but the actual probe behavior depends on the saved monitor definition.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {monitorTypeGuide.map((item) => (
                <DetailBlock key={item.title} title={item.title} body={item.body} />
              ))}
            </CardContent>
          </Card>
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
    <div className="rounded-lg border bg-muted/[0.06] px-4 py-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function ProductFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
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
    <div className="rounded-lg border bg-muted/[0.04] px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-md border bg-background">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
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

function DetailBlock({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/[0.06] px-4 py-4">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{body}</p>
    </div>
  );
}
