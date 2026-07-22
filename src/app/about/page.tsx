import Link from "next/link";
import {
  Activity,
  BellRing,
  Database,
  FileText,
  Globe2,
  HeartPulse,
  ServerCog,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { SentroviaMark } from "@/components/brand/sentrovia-mark";

const linkButtonClassName =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium whitespace-nowrap transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const ghostLinkClassName =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-medium whitespace-nowrap transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const capabilities = [
  {
    icon: Activity,
    title: "Service monitoring",
    description: "HTTP, keyword, JSON, TCP, ping, PostgreSQL, and heartbeat checks share one scheduling model.",
  },
  {
    icon: ShieldCheck,
    title: "Failure verification",
    description: "A first failure enters verification. Down notifications are sent only after the configured attempts fail.",
  },
  {
    icon: BellRing,
    title: "Notification delivery",
    description: "Email, Telegram, Discord, and webhook outcomes are recorded so failed deliveries remain visible.",
  },
  {
    icon: FileText,
    title: "HTML reports",
    description: "Manual and scheduled reports summarize availability, latency, and failures for a workspace or company.",
  },
];

const runtime = [
  {
    icon: Globe2,
    title: "Web application",
    description: "Stores monitor configuration, members, settings, reports, and public status page preferences.",
  },
  {
    icon: ServerCog,
    title: "Worker",
    description: "Claims due monitors, performs checks, verifies failures, and dispatches notifications and scheduled reports.",
  },
  {
    icon: Database,
    title: "PostgreSQL",
    description: "Keeps configuration and runtime history durable across browser refreshes, restarts, and updates.",
  },
];

const operatingRules = [
  "Timeouts remain availability failures, but they are verified before an outage is confirmed.",
  "A successful response above the slow threshold stays up and can produce a separate latency notification.",
  "If the worker host loses internet access, checks and outbound worker tasks pause to avoid false outage alerts.",
  "Monitor-level notification language and templates override workspace defaults only for that monitor.",
  "Public status pages publish active monitors from the selected company, or the full workspace when no company is selected.",
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

export default function AboutPage() {
  return (
    <div className="flex w-full flex-col gap-8 animate-in fade-in duration-200">
      <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <SentroviaMark className="size-11 rounded-lg border bg-card text-lg" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">About Sentrovia</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Self-hosted monitoring for teams that need verifiable outages, clear delivery history, and company-level reporting.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/help" className={linkButtonClassName}>Open help</Link>
          <Link href="/system-health" className={linkButtonClassName}>
            <HeartPulse data-icon="inline-start" />
            System health
          </Link>
        </div>
      </header>

      <section aria-labelledby="capabilities-title">
        <div className="mb-4">
          <h2 id="capabilities-title" className="text-base font-semibold">What Sentrovia does</h2>
          <p className="mt-1 text-sm text-muted-foreground">The main workflows available in the current application.</p>
        </div>
        <div className="grid border-y md:grid-cols-2 xl:grid-cols-4 xl:divide-x">
          {capabilities.map((item) => (
            <div key={item.title} className="py-5 xl:px-5 xl:first:pl-0 xl:last:pr-0">
              <item.icon className="size-4 text-muted-foreground" />
              <h3 className="mt-3 text-sm font-medium">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="runtime-title">
        <div className="mb-4">
          <h2 id="runtime-title" className="text-base font-semibold">Runtime architecture</h2>
          <p className="mt-1 text-sm text-muted-foreground">Three services share responsibility without hiding state in the browser.</p>
        </div>
        <div className="grid gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-3">
          {runtime.map((item) => (
            <div key={item.title} className="bg-card p-5">
              <div className="flex items-center gap-2">
                <item.icon className="size-4 text-primary" />
                <h3 className="text-sm font-medium">{item.title}</h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
        <section aria-labelledby="rules-title">
          <h2 id="rules-title" className="text-base font-semibold">Important behavior</h2>
          <p className="mt-1 text-sm text-muted-foreground">Rules that affect status and notification decisions.</p>
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
          <p className="mt-1 text-sm text-muted-foreground">Checks supported by the worker.</p>
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

      <footer className="flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Deployment, update, backup, and troubleshooting instructions are maintained in Help and README.
        </p>
        <Link href="/settings" className={ghostLinkClassName}>
          <Settings2 data-icon="inline-start" />
          Open settings
        </Link>
      </footer>
    </div>
  );
}
