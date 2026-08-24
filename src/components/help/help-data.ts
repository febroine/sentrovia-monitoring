import type { ElementType } from "react";
import {
  BellRing,
  Box,
  Database,
  Mail,
  Radar,
  ServerCog,
} from "lucide-react";

export type HelpCategory = {
  value: string;
  label: string;
  icon: ElementType;
  accent: string;
  summary: string;
  faqs: Array<{
    question: string;
    answer: string;
  }>;
};

export const quickNotes = [
  "If monitors look stale, check Monitoring > Worker Pulse and Dashboard > System Health before changing monitor settings.",
  "If a notification did not arrive, inspect Delivery before changing monitor settings.",
  "If a hostname has no DNS record yet, you can still save it; the worker records a DNS failure until it resolves.",
  "If a timeout alert feels noisy, check whether it was a confirmed timeout outage or a slow-but-online latency warning.",
  "If every monitor becomes stale together, check worker heartbeat and host connectivity; an offline connectivity guard pauses due work without changing monitor states.",
  "If a new release is available, use Settings > Updates for host-side commands instead of expecting the browser to update the app.",
];

export const helpCategories: HelpCategory[] = [
  {
    value: "monitoring",
    label: "Monitoring",
    icon: ServerCog,
    accent: "text-orange-600 dark:text-orange-300",
    summary: "How checks are scheduled, verified, stored, and surfaced across the product.",
    faqs: [
      {
        question: "What monitor types are available today?",
        answer:
          "Sentrovia currently supports HTTP or HTTPS, keyword, JSON assertion, TCP or port, PostgreSQL, ping or ICMP, and cron or heartbeat monitors. They all share the same worker, verification, timeline, and delivery pipeline while using type-specific check logic.",
      },
      {
        question: "How does a new monitor move from pending to a live state?",
        answer:
          "A monitor starts as pending, waits for the worker to pick it up, then receives its first persisted check result. That result writes status, code, latency, timestamps, and next check time back into PostgreSQL.",
      },
      {
        question: "Can I add a site before its DNS record exists?",
        answer:
          "Yes. A syntactically valid HTTP or HTTPS target can be saved even when the Sentrovia server cannot resolve it yet. The worker records the check as a DNS availability failure, applies Verification Mode, and automatically returns the monitor to up when DNS and the service become reachable.",
      },
      {
        question: "Why are some network targets still blocked?",
        answer:
          "Private network targets are available only to administrators when MONITOR_ALLOW_PRIVATE_TARGETS is true. Members remain limited to public endpoints, and localhost, loopback, link-local, multicast, and cloud metadata targets stay blocked. Sentrovia pins every check to the validated DNS answer before connecting.",
      },
      {
        question: "What is Verification Mode?",
        answer:
          "Verification Mode starts after the first failure. Instead of confirming an outage immediately, Sentrovia schedules one-minute confirmation checks and waits until the configured threshold is reached.",
      },
      {
        question: "How are timeout, HTTP failure, and slow response different?",
        answer:
          "HTTP 4xx or 5xx responses, assertion failures, DNS, TLS, connection errors, and hard request timeouts are availability failures. A timeout still needs verification before it becomes a confirmed outage. A response that completes after the slow-response threshold stays up, appears degraded on public status pages, and only sends a latency warning after repeated slow checks.",
      },
      {
        question: "What does the retries field control right now?",
        answer:
          "The failure threshold includes the initial failed probe. Sentrovia then performs one-minute verification probes and requires one final immediate confirmation failure before it confirms the outage, which prevents a service that just recovered from producing a stale down alert.",
      },
      {
        question: "What happens if a monitor recovers during verification?",
        answer:
          "The verification counter resets, verification mode closes, and the monitor returns to its normal interval. In that case no outage notification is sent because the failure was never confirmed.",
      },
      {
        question: "How does a heartbeat monitor work?",
        answer:
          "A heartbeat monitor stays healthy as long as an external job hits its generated endpoint within the expected window. If the heartbeat stops arriving, the worker marks it failing and the normal verification and delivery flow begins.",
      },
      {
        question: "How does ping monitoring differ from HTTP monitoring?",
        answer:
          "Ping monitors validate basic network reachability with ICMP. HTTP monitors validate the web response itself, including status, content, JSON assertions, redirects, SSL handling, and latency.",
      },
      {
        question: "Can two monitors be checked at the same time?",
        answer:
          "Yes. Sentrovia uses concurrency-limited asynchronous execution. Multiple due monitors can be checked in parallel as long as the configured concurrency ceiling has not been reached.",
      },
      {
        question: "Why might a due monitor not run immediately?",
        answer:
          "If many checks become due together, batch size and concurrency control can delay a monitor briefly. The worker also pauses monitor claims, webhook retries, and scheduled report delivery when every configured internet canary is unreachable. It leaves monitor states unchanged and resumes due work automatically after connectivity returns.",
      },
      {
        question: "Does changing a monitor affect future checks immediately?",
        answer:
          "Yes. Once the monitor row is saved, the next worker cycle reads the new persisted settings. There is no separate sync or deploy step between the UI and the worker runtime.",
      },
    ],
  },
  {
    value: "worker",
    label: "Worker health",
    icon: Radar,
    accent: "text-sky-600 dark:text-sky-300",
    summary: "How to confirm that checks are running and distinguish process, queue, and connectivity problems.",
    faqs: [
      {
        question: "Where can I check worker health?",
        answer:
          "Dashboard > System Health summarizes worker, connectivity, due queue, and delivery alarms. Administrators also see Worker Pulse on Monitoring, including heartbeat age, last cycle, process ID, due backlog, cycle duration, current state, and the latest status message.",
      },
      {
        question: "What is due backlog?",
        answer:
          "Due backlog is the number of checks waiting to be claimed by the worker. A growing backlog usually means the worker is under-sized, blocked by errors, or temporarily behind the workspace load.",
      },
      {
        question: "What does Worker Pulse status mean?",
        answer:
          "Running means the worker is reporting a current heartbeat and processing or waiting for work. Standby means a process exists but checks are not currently running. Offline means no live process is detected. Connectivity degraded means the worker process is alive, but due work is paused because every configured canary is unreachable.",
      },
      {
        question: "Why is heartbeat important if the UI is still open?",
        answer:
          "Because the browser does not execute checks. Heartbeat is a persisted signal from the real worker process, so it is the trustworthy indicator of whether monitoring is actually alive.",
      },
      {
        question: "What happens while host connectivity is unavailable?",
        answer:
          "The worker keeps its heartbeat alive but does not claim or run due monitors. Webhook retries and scheduled report delivery are paused as well. Existing monitor and outage states stay unchanged, so a host-side network failure cannot create a workspace-wide false outage.",
      },
      {
        question: "What should I do when the worker is stale or offline?",
        answer:
          "Check Dashboard > System Health first. In Docker, confirm the worker container is running and using the same database and environment as the web service. In a Windows/NSSM install, confirm the worker service is running. After a restart, verify that heartbeat age falls and the due backlog begins to clear.",
      },
      {
        question: "Does the browser run monitor checks?",
        answer:
          "No. The browser only reads and changes persisted configuration. The separate worker process claims due monitors, performs checks, verifies failures, sends notifications, retries webhooks, and delivers scheduled reports.",
      },
    ],
  },
  {
    value: "delivery",
    label: "Delivery",
    icon: Mail,
    accent: "text-violet-600 dark:text-violet-300",
    summary: "How channel testing, retry behavior, payload rendering, and history tracking work.",
    faqs: [
      {
        question: "Which delivery channels exist right now?",
        answer:
          "Sentrovia supports email and Telegram monitor notifications, plus workspace-level Discord and generic webhook channels. Delivery attempts are recorded per channel so one failing destination does not hide the outcome of another.",
      },
      {
        question: "Can notifications be sent in Turkish?",
        answer:
          "Yes. Settings > Notifications includes a notification language option. Email and Telegram default templates are rendered in the selected language unless a monitor-level custom template overrides the workspace default.",
      },
      {
        question: "Why do notification cards have separate Save buttons?",
        answer:
          "Notification settings are grouped by operational concern: alert conditions, SMTP delivery, additional channels, and templates. Each card can be saved from its own header, while the page-level save action remains available for broader changes.",
      },
      {
        question: "Can I test channels without triggering a real outage?",
        answer:
          "Yes. The Delivery area includes test tooling so you can validate SMTP, Telegram, Discord, and webhook destinations without waiting for a real monitor failure.",
      },
      {
        question: "Where do notification failures go?",
        answer:
          "Email, Telegram, Discord, and webhook attempts are stored in Delivery history with retry metadata, response codes, and error details. Temporary failures remain in the retry queue; permanent or exhausted failures are marked as dead-lettered.",
      },
      {
        question: "Can a failed delivery be retried manually?",
        answer:
          "Yes. Open a failed row in Delivery history and choose Retry delivery. Sentrovia reuses the original event and records the new result on the same history item instead of creating a duplicate notification.",
      },
      {
        question: "How is channel health calculated?",
        answer:
          "Delivery shows a 24-hour health view for each channel. It includes delivered, failed, and retrying events, the terminal error rate, the latest error, and whether the channel is healthy, degraded, unhealthy, or has no recent data.",
      },
      {
        question: "Will a channel failure block the rest of the channels?",
        answer:
          "No. Delivery attempts are tracked per channel. A failing webhook does not automatically cancel a valid email or Telegram attempt unless the event itself was suppressed before delivery started.",
      },
      {
        question: "Why might a delivery row show success while the user still did not see it?",
        answer:
          "Delivered means the configured channel accepted the request. It does not always guarantee inbox placement, downstream relay success, or chat-side permissions after that point.",
      },
    ],
  },
  {
    value: "reports",
    label: "Reports",
    icon: BellRing,
    accent: "text-emerald-600 dark:text-emerald-300",
    summary: "How previews, scheduled delivery, report scope, and report-driven operations work.",
    faqs: [
      {
        question: "What can the Reports page generate?",
        answer:
          "Every report covers the rolling previous 7 days ending when it is generated. You can preview or email one immediately, or schedule weekly or monthly email delivery for the whole workspace or a single company. Monthly changes the send cadence, not the seven-day reporting window.",
      },
      {
        question: "What is the difference between Preview Studio and Schedule Manager?",
        answer:
          "Preview Studio is for on-demand generation and manual send. Schedule Manager is for recurring delivery, search and filtering, toggling active state, loading a schedule back into the builder, and sending scheduled reports immediately.",
      },
      {
        question: "What is included in a generated report?",
        answer:
          "A report includes monitor count, current state mix, uptime percentage, average latency, failure count, affected URLs, latency watchlist, recent failure details, and a ranked monitor breakdown for the selected period. It uses monitor URLs instead of arbitrary monitor names so recipients can understand the affected service quickly.",
      },
      {
        question: "Which file formats are sent with reports?",
        answer:
          "Scheduled and manual report delivery sends one browser-ready HTML attachment.",
      },
      {
        question: "Can I change the report name and email subject?",
        answer:
          "Yes. In Reports, open report customization to set the brand or sender name and a complete email subject template. The brand is used in the email header, attached HTML report, and default subject prefix. Subject templates support the tokens listed beside the field, and the preview shows the resolved subject before sending.",
      },
      {
        question: "Why is there no status-code table or checks count in the report?",
        answer:
          "The current report focuses on operator decisions rather than raw counters. Status-code tables and check-count labels were removed to keep the report easier to read, while failure details and latency context remain visible.",
      },
      {
        question: "Can I create company-specific reports?",
        answer:
          "Yes. Company-scoped reporting is built in. Choose company scope, select the target company, and Sentrovia limits the report to that company's monitors and history.",
      },
      {
        question: "How are scheduled reports delivered?",
        answer:
          "The worker claims active schedules whose next run time is due, renders the rolling seven-day report, and emails it to the configured recipient list. Scheduled report delivery pauses while the worker connectivity guard is offline and resumes after connectivity returns.",
      },
      {
        question: "Can I pause or delete a schedule later?",
        answer:
          "Yes. Schedule Manager lets you pause, resume, send now, load into the builder, or delete any saved schedule directly from the reports page.",
      },
    ],
  },
  {
    value: "deployment",
    label: "Deployment",
    icon: Box,
    accent: "text-rose-600 dark:text-rose-300",
    summary: "How local mode, Docker mode, and the runtime model work.",
    faqs: [
      {
        question: "How does Docker mode run this project?",
        answer:
          "The Docker stack runs PostgreSQL, the Next.js web console, and the worker as separate services. The worker is not simulated in the browser. Its health is inferred from heartbeat rows and stored worker state in the database.",
      },
      {
        question: "What happens on the first install?",
        answer:
          "The first boot starts with onboarding. The first user enters their own email, username, and password, then Sentrovia creates that account with admin privileges. After setup, future access uses login and admins manage accounts from the Members page.",
      },
      {
        question: "What if an existing workspace has no admin?",
        answer:
          "Onboarding stays closed once any account exists. From the server, run npm run auth:recover-admin -- --identifier followed by an existing account email or username. In Docker, prefix that command with docker compose exec web. Recovery only works when no admin exists, promotes an existing account, and closes that account's old sessions.",
      },
      {
        question: "Do I need to create every environment value manually?",
        answer:
          "No. Docker installers create a private .env with strong stable secrets, while the Windows/NSSM installer creates .env.local. On later updates, installers preserve database credentials and application secrets, then append only missing non-secret runtime defaults such as MONITOR_ALLOW_PRIVATE_TARGETS. Explicit values are never overwritten.",
      },
      {
        question: "Can I tell if the worker is truly alive?",
        answer:
          "Yes. Dashboard > System Health shows process, connectivity, queue, and delivery health. Administrators can use Monitoring > Worker Pulse for heartbeat age, last cycle time, process ID, backlog, cycle duration, and the current worker message. A current heartbeat proves that the worker process, rather than the browser, is alive.",
      },
      {
        question: "How does Sentrovia avoid mass false alerts when the server loses internet access?",
        answer:
          "Before claiming due work, the worker probes multiple independent HTTP or HTTPS canaries. If none responds, it pauses monitor checks, webhook retries, and scheduled report delivery without changing monitor or outage state. Any HTTP response, including a non-success status, proves reachability. Restricted environments can set WORKER_CONNECTIVITY_TARGETS to reliable endpoints reachable from that host.",
      },
      {
        question: "What happens if the worker container restarts?",
        answer:
          "The worker resumes from persisted state. Because schedules, check history, heartbeat, and worker metrics are stored in PostgreSQL, the runtime continues from database truth rather than in-memory assumptions.",
      },
      {
        question: "How should I update a Docker deployment?",
        answer:
          "Use Settings > Updates to find the latest GitHub Release tag, release notes, and copyable host-side commands. The app does not update itself from the browser. Docker installs usually fetch tags, check out the target release, then rebuild and restart with Docker Compose while keeping .env files and PostgreSQL volumes in place.",
      },
      {
        question: "How should I update a Windows/NSSM or manual Node.js deployment?",
        answer:
          "For first-time setup, run scripts\\install-windows-nssm.ps1 in an Administrator PowerShell session. For an existing NSSM server, place the new release files in the project directory and double-click UPDATE-SENTROVIA.bat. It preserves .env.local and database records, fills missing safe runtime defaults, validates a clean build, applies pending migrations under a database lock, restarts both services, and restores previous dependencies and build output when startup fails. A timestamped transcript is saved under logs.",
      },
      {
        question: "What should I do after changing environment variables in Docker mode?",
        answer:
          "Rebuild and restart the affected services. That ensures the running web and worker containers boot with the new configuration instead of stale startup values.",
      },
    ],
  },
  {
    value: "data",
    label: "Data",
    icon: Database,
    accent: "text-amber-600 dark:text-amber-300",
    summary: "What is stored permanently, what is summarized, and how the UI reads durable state.",
    faqs: [
      {
        question: "Where does dashboard data come from?",
        answer:
          "Dashboard panels read durable state from PostgreSQL, including current monitor status, worker heartbeat, recent checks, events, delivery outcomes, and report schedule state. The browser is never the source of truth.",
      },
      {
        question: "Can I customize my dashboard?",
        answer:
          "Yes. Use Customize on Dashboard to choose widgets, change their order, save a company scope, and switch between all, favorite, or critical monitors. Favorite and critical flags are stored per monitor and can be changed directly from the monitor focus widget.",
      },
      {
        question: "What is the difference between timeline, logs, reports, and dashboard summaries?",
        answer:
          "Timeline is monitor-specific check history, logs are cross-monitor operational events, reports are period-based summaries, and dashboard cards are fast aggregates. All of them read from the same persisted store.",
      },
      {
        question: "Why are some values rounded or summarized?",
        answer:
          "Operator-facing surfaces are optimized for quick reading. They summarize the stored dataset instead of dumping every raw row, while still preserving the underlying detailed history.",
      },
      {
        question: "Can imported or bulk-edited monitors stay partially empty?",
        answer:
          "Only if the missing fields can be safely filled by workspace defaults. Required monitor identity fields still need to exist, otherwise the row is rejected during validation.",
      },
      {
        question: "What happens when I delete monitors?",
        answer:
          "Monitoring never deletes selected monitors immediately. A confirmation dialog takes a snapshot of the selection, lists the affected monitors, and explains that related monitoring history will be removed. The API call only runs after explicit confirmation, and a failed deletion remains visible instead of being reported as successful.",
      },
      {
        question: "Do saved filters and presets survive a browser restart?",
        answer:
          "Yes. User-facing saved settings live in the database for the signed-in user, so they remain available across browser sessions instead of existing only in local browser state.",
      },
    ],
  },
];
