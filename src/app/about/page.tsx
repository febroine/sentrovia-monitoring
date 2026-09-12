import Link from "next/link";
import { ArrowRight, ArrowUpRight, Database, FileCheck2, GitBranch, ShieldCheck } from "lucide-react";
import { SentroviaLogo } from "@/components/brand/sentrovia-logo";
import { PublicSiteShell } from "@/components/public/public-site-shell";
import { getSession } from "@/lib/auth/session";
import packageJson from "../../../package.json";

const linkButtonClassName =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-sm font-medium whitespace-nowrap transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const resourceLinkClassName =
  "inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const capabilities = [
  {
    title: "Service monitoring",
    description: "HTTP, keyword, JSON, TCP, ping, PostgreSQL, and heartbeat checks share one scheduling model.",
  },
  {
    title: "Failure verification",
    description: "A first failure enters verification. Down notifications are sent only after the configured attempts fail.",
  },
  {
    title: "Notification delivery",
    description: "Email, Telegram, Discord, and webhook outcomes are recorded so failed deliveries remain visible.",
  },
  {
    title: "HTML reports",
    description: "Manual and scheduled reports summarize availability, latency, and failures for a workspace or company.",
  },
  {
    title: "Public status pages",
    description: "Share service availability through company-specific pages or an optional workspace-wide page.",
  },
];

const runtime = [
  {
    title: "Web application",
    description: "Your control surface for monitors, members, status pages, and reports. Checks continue when the browser is closed.",
  },
  {
    title: "Worker",
    description: "Claims due monitors, performs checks, verifies failures, and dispatches notifications and scheduled reports.",
  },
  {
    title: "PostgreSQL",
    description: "Keeps configuration and runtime history durable across browser refreshes, restarts, and updates.",
  },
];

const operatingRules = [
  "Timeouts remain availability failures, but they are verified before an outage is confirmed.",
  "A successful response above the slow threshold stays up and can produce a separate latency notification.",
  "If every connectivity canary is unreachable, the worker pauses monitor checks, webhook retries, and scheduled reports without changing monitor states.",
  "Monitor-level notification language and templates override workspace defaults only for that monitor.",
  "Public status pages can be published separately for each company, plus an optional workspace-wide page.",
];

const monitorTypes = [
  ["HTTP", "Response status, latency, redirects, and optional TLS expiry"],
  ["Keyword", "HTTP response with required or forbidden text"],
  ["JSON", "HTTP response with a JSON path assertion"],
  ["TCP port", "Host and port reachability"],
  ["Ping", "ICMP host reachability"],
  ["PostgreSQL", "Database connection and authentication"],
  ["Heartbeat", "Expected calls from scheduled or background jobs"],
] as const;

const projectDetails = [
  ["Installed version", packageJson.version],
  ["License", "MIT"],
  ["Node.js requirement", packageJson.engines.node],
  ["Deployment", "Docker Compose or Windows services"],
] as const;

const resources = [
  { label: "Source code", href: packageJson.homepage, description: "Explore the implementation and contribute." },
  { label: "Releases", href: `${packageJson.homepage}/releases`, description: "Read release notes before updating your installation." },
  { label: "Report an issue", href: packageJson.bugs.url, description: "Include your version and reproduction steps; remove credentials and private data." },
] as const;

export default async function AboutPage() {
  const session = await getSession();
  return session ? <AuthenticatedAboutPage /> : <PublicAboutPage />;
}

function AuthenticatedAboutPage() {
  return (
    <div className="flex w-full flex-col gap-10 pb-4">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">About Sentrovia</h1>
          <p className="mt-1 text-sm text-muted-foreground">The product, this installation, and the project behind it.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/help" className={linkButtonClassName}>Open help</Link>
        </div>
      </header>

      <section aria-labelledby="product-title" className="grid gap-8 rounded-lg bg-card/45 p-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,1fr)] lg:gap-12 lg:p-8">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h2 id="product-title"><SentroviaLogo className="text-3xl" /></h2>
          </div>
          <p className="mt-5 max-w-xl text-lg font-medium leading-7 text-balance">Self-hosted monitoring, with verification before the alert.</p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Keep websites, APIs, databases, and scheduled jobs in one operations workspace.
            Investigate failures, follow notification delivery, and share service status from your own infrastructure.
          </p>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">Open source under the MIT license. Built and maintained by Febroine.</p>
        </div>
        <dl className="grid gap-2 self-start rounded-md bg-muted/20 p-3">
          {projectDetails.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[1fr_1fr] gap-4 rounded-sm bg-background/30 p-3">
              <dt className="text-[13px] text-muted-foreground">{label}</dt>
              <dd className="text-sm font-medium break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="capabilities-title">
        <div className="mb-3">
          <h2 id="capabilities-title" className="text-base font-semibold">What Sentrovia does</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {capabilities.map((item) => (
            <div key={item.title} className="rounded-md bg-card/55 p-4">
              <h3 className="text-sm font-medium">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="runtime-title">
        <div className="mb-3">
          <h2 id="runtime-title" className="text-base font-semibold">Three parts, one installation</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">The web console and worker use the same PostgreSQL database.</p>
        </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {runtime.map((item, index) => (
              <li key={item.title} className="flex gap-3 rounded-md bg-muted/20 p-5">
                <span aria-hidden="true" className="text-sm font-medium text-primary">{index + 1}.</span>
                <div>
                  <h3 className="text-sm font-medium">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                </div>
              </li>
            ))}
        </ol>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
        <section aria-labelledby="rules-title">
          <h2 id="rules-title" className="text-base font-semibold">Important behavior</h2>
          <ol className="mt-4 grid gap-2">
            {operatingRules.map((rule, index) => (
              <li key={rule} className="flex gap-3 rounded-md bg-muted/20 p-3 text-sm leading-6 text-muted-foreground">
                <span className="w-5 shrink-0 font-medium text-foreground">{index + 1}.</span>
                <span>{rule}</span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="monitor-types-title">
          <h2 id="monitor-types-title" className="text-base font-semibold">Monitor types</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Service reachability and response health. CPU, memory, and disk telemetry are outside this scope.</p>
          <dl className="mt-4 grid gap-2">
            {monitorTypes.map(([name, description]) => (
              <div key={name} className="grid gap-1 rounded-md bg-muted/20 p-3 sm:grid-cols-[110px_1fr]">
                <dt className="text-sm font-medium">{name}</dt>
                <dd className="text-sm text-muted-foreground">{description}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <footer aria-labelledby="resources-title" className="rounded-lg bg-card/35 p-6">
        <h2 id="resources-title" className="text-base font-semibold">Project resources</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-3">
          {resources.map((resource) => (
            <div key={resource.label}>
              <a href={resource.href} target="_blank" rel="noreferrer" className={resourceLinkClassName}>
                {resource.label}<ArrowUpRight aria-hidden="true" className="size-4" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{resource.description}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm leading-6 text-muted-foreground">For deployment and troubleshooting, visit <Link href="/help" className="text-foreground underline underline-offset-4 hover:text-primary">Help</Link>. Manage your installation through <Link href="/settings" className="text-foreground underline underline-offset-4 hover:text-primary">Settings</Link>.</p>
      </footer>
    </div>
  );
}

const publicPrinciples = [
  { icon: ShieldCheck, title: "Verify before escalating", description: "A failed request enters confirmation instead of becoming an outage alert on the first miss." },
  { icon: FileCheck2, title: "Keep the evidence", description: "Results, failure context, and notification attempts stay inspectable in the workspace." },
  { icon: Database, title: "Run it where you work", description: "Sentrovia is self-hosted with Docker Compose or Windows services, backed by your PostgreSQL database." },
];

function PublicAboutPage() {
  return (
    <PublicSiteShell active="about">
      <div className="w-full px-[clamp(1rem,4vw,4.5rem)]">
        <section id="product" className="grid min-h-[min(40rem,calc(100svh-4.5rem))] scroll-mt-20 items-center gap-12 py-16 sm:py-24 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)] lg:gap-24 lg:py-24">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-space-electric">About / Sentrovia</p>
            <h1 className="mt-5 max-w-4xl text-balance text-[clamp(3.25rem,7vw,7.5rem)] font-semibold leading-[0.88] tracking-[-0.06em]">Monitoring that explains itself.</h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-blue-100/65">Sentrovia is an open-source, self-hosted uptime monitoring workspace for teams that need more than a green dot.</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/onboarding" className="inline-flex min-h-12 items-center gap-2 rounded-md bg-space-blue px-5 pb-px text-sm leading-none font-semibold text-white transition-colors hover:bg-space-electric hover:text-space-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-electric/80">Start with Sentrovia <ArrowRight aria-hidden="true" className="size-4" /></Link>
              <a href={packageJson.homepage} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-md border border-space-blue/35 px-5 pb-px text-sm leading-none font-medium text-space-ice transition-colors hover:border-space-blue/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-electric/80">View on GitHub <GitBranch aria-hidden="true" className="size-4" /><span className="sr-only"> (opens in a new tab)</span></a>
            </div>
          </div>

          <aside className="rounded-xl bg-space-navy/45 p-1" aria-label="Sentrovia product principle">
            <div className="rounded-lg bg-space-blue/10 px-5 py-4 font-mono text-[10px] uppercase tracking-[0.16em] text-blue-100/45 sm:px-7">The operating principle</div>
            <div className="px-5 py-7 sm:px-7 sm:py-9">
              <p className="text-2xl font-semibold leading-tight tracking-[-0.035em] text-space-ice">A check is a question. An outage is a conclusion.</p>
              <div className="mt-8 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-space-electric"><span className="size-2 bg-space-electric" /> Confirm the signal before you page the team.</div>
            </div>
            <div className="px-5 py-4 text-sm leading-6 text-blue-100/55 sm:px-7">Sentrovia checks the service, verifies the failure, and leaves a trail you can inspect.</div>
          </aside>
        </section>

        <section aria-labelledby="principles-title" className="py-16 sm:py-20">
          <div className="mb-10 max-w-xl"><p className="font-mono text-[11px] uppercase tracking-[0.18em] text-space-electric">What we optimize for</p><h2 id="principles-title" className="mt-4 text-3xl font-semibold tracking-[-0.04em]">Less noise. More context.</h2></div>
          <ol className="grid gap-4 md:grid-cols-3">
            {publicPrinciples.map((item, index) => { const Icon = item.icon; return <li key={item.title} className="rounded-xl bg-space-navy/35 p-6"><div className="flex items-center justify-between gap-4"><Icon aria-hidden="true" className="size-5 text-space-electric" /><span className="font-mono text-[10px] tracking-[0.16em] text-blue-100/40">0{index + 1}</span></div><h3 className="mt-8 text-base font-semibold">{item.title}</h3><p className="mt-3 text-sm leading-6 text-blue-100/60">{item.description}</p></li>; })}
          </ol>
        </section>

        <section aria-labelledby="runtime-public-title" className="grid gap-10 py-16 sm:py-20 lg:grid-cols-[0.75fr_1.25fr] lg:gap-24">
          <div><p className="font-mono text-[11px] uppercase tracking-[0.18em] text-space-electric">Under your control</p><h2 id="runtime-public-title" className="mt-4 text-3xl font-semibold tracking-[-0.04em]">One installation, three responsibilities.</h2><p className="mt-4 max-w-md text-sm leading-7 text-blue-100/60">The web console is where you decide. The worker is where checks happen. PostgreSQL is where the trail stays durable.</p></div>
          <div className="grid gap-3 rounded-xl bg-space-navy/35 p-4">
            {runtime.map((item, index) => <div key={item.title} className="grid gap-3 rounded-lg bg-space-ink/45 p-4 sm:grid-cols-[4rem_10rem_1fr] sm:items-start"><span className="font-mono text-[11px] tracking-[0.16em] text-space-electric">0{index + 1}</span><h3 className="text-sm font-semibold">{item.title}</h3><p className="text-sm leading-6 text-blue-100/60">{item.description}</p></div>)}
          </div>
        </section>

        <section className="flex flex-col gap-5 py-12 sm:flex-row sm:items-center sm:justify-between"><p className="max-w-xl text-sm leading-6 text-blue-100/55">Open source under the MIT license. Explore the implementation, releases, and the roadmap on GitHub.</p><a href={packageJson.homepage} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-space-ice underline decoration-space-blue/60 underline-offset-4 transition-colors hover:text-space-electric focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-space-electric/70">Explore the project <ArrowUpRight aria-hidden="true" className="size-4" /><span className="sr-only"> (opens in a new tab)</span></a></section>
      </div>
    </PublicSiteShell>
  );
}
