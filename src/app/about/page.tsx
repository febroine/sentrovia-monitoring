import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SentroviaMark } from "@/components/brand/sentrovia-mark";
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

export default function AboutPage() {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-10 pb-4">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">About Sentrovia</h1>
          <p className="mt-1 text-sm text-muted-foreground">The product, this installation, and the project behind it.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/help" className={linkButtonClassName}>Open help</Link>
        </div>
      </header>

      <section aria-labelledby="product-title" className="grid gap-8 border-y py-7 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,1fr)] lg:gap-12">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <SentroviaMark className="size-10" />
            <h2 id="product-title" className="text-2xl font-semibold tracking-tight" translate="no">Sentrovia</h2>
          </div>
          <p className="mt-5 max-w-xl text-lg font-medium leading-7 text-balance">Self-hosted monitoring, with verification before the alert.</p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Keep websites, APIs, databases, and scheduled jobs in one operations workspace.
            Investigate failures, follow notification delivery, and share service status from your own infrastructure.
          </p>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">Open source under the MIT license. Built and maintained by Febroine.</p>
        </div>
        <dl className="divide-y self-start border-t lg:border-t-0">
          {projectDetails.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[1fr_1fr] gap-4 py-3 lg:first:pt-0">
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
        <div className="grid gap-x-8 sm:grid-cols-2 xl:grid-cols-3">
          {capabilities.map((item) => (
            <div key={item.title} className="border-t py-4">
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
          <ol className="grid gap-x-8 border-y md:grid-cols-3">
            {runtime.map((item, index) => (
              <li key={item.title} className="flex gap-3 py-5">
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
          <ol className="mt-4 divide-y border-y">
            {operatingRules.map((rule, index) => (
              <li key={rule} className="flex gap-3 py-3 text-sm leading-6 text-muted-foreground">
                <span className="w-5 shrink-0 font-medium text-foreground">{index + 1}.</span>
                <span>{rule}</span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="monitor-types-title">
          <h2 id="monitor-types-title" className="text-base font-semibold">Monitor types</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Service reachability and response health. CPU, memory, and disk telemetry are outside this scope.</p>
          <dl className="mt-4 divide-y border-y">
            {monitorTypes.map(([name, description]) => (
              <div key={name} className="grid gap-1 py-3 sm:grid-cols-[110px_1fr]">
                <dt className="text-sm font-medium">{name}</dt>
                <dd className="text-sm text-muted-foreground">{description}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <footer aria-labelledby="resources-title" className="border-t pt-6">
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
