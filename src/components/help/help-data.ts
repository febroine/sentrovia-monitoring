import type { ElementType } from "react";
import {
  BellRing,
  Box,
  Database,
  Mail,
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
  "If a monitor looks stuck, check its timeline and the worker heartbeat first.",
  "If a notification did not arrive, inspect Delivery before changing monitor settings.",
  "If a pushed GitHub change should trigger an update banner, bump package.json version and configure APP_UPDATE_REPO.",
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
        question: "How does a new monitor move from Pending to a live state?",
        answer:
          "A monitor starts as pending, waits for the worker to pick it up, then receives its first check result. That result writes status, code, latency, timestamps, and next check time back into PostgreSQL.",
      },
      {
        question: "Does Sentrovia use per-site settings or workspace defaults?",
        answer:
          "Per-site settings always win. Workspace defaults only fill gaps during create, bulk edit, and CSV import so new monitor records stay complete without repetitive manual input.",
      },
      {
        question: "What is Verification Mode?",
        answer:
          "Verification Mode begins after the first failure. Instead of opening an outage immediately, Sentrovia schedules one-minute confirmation checks and waits until the configured verification threshold is met.",
      },
      {
        question: "What does the retries field control right now?",
        answer:
          "Retries define the confirmation threshold inside Verification Mode. If a monitor is configured for four attempts, Sentrovia performs up to four one-minute verification failures before confirming the incident.",
      },
      {
        question: "What happens if a monitor recovers during verification?",
        answer:
          "The verification counter resets, verification mode closes, and the monitor returns to its normal user-defined interval. No outage notification is sent in that case.",
      },
      {
        question: "How does batch size affect a large workspace?",
        answer:
          "Batch size limits how many due monitors are taken from a workspace during one worker cycle. It prevents a 500-site workspace from monopolizing all execution capacity at once.",
      },
      {
        question: "How often does the worker wake up to look for due monitors?",
        answer:
          "The worker polls on a shorter internal loop than monitor intervals. It uses that loop to find records whose nextCheckAt is due, then decides which checks should be executed in that cycle.",
      },
      {
        question: "Can two monitors be checked at the same time?",
        answer:
          "Yes. Sentrovia uses concurrency-limited asynchronous execution. Multiple due monitors can be checked in parallel as long as the configured concurrency ceiling has not been reached.",
      },
      {
        question: "What monitor types are available today?",
        answer:
          "Sentrovia currently supports HTTP and HTTPS monitors, TCP or port monitors, and PostgreSQL monitors. Each type uses the same verification, logging, and delivery pipeline while running a type-specific checker under the worker.",
      },
      {
        question: "How does a PostgreSQL monitor decide that the target is healthy?",
        answer:
          "The PostgreSQL checker opens a connection with the saved host, port, database, user, and SSL preference, then runs a lightweight SELECT 1. A successful round trip marks the monitor healthy.",
      },
      {
        question: "How does a TCP or port monitor work?",
        answer:
          "Port monitors attempt a real socket connection to the configured host and port. If the connection opens within the timeout, the monitor is healthy. If it times out or is refused, the failure enters the same verification flow as other monitor types.",
      },
      {
        question: "Why might a monitor be due but not run instantly?",
        answer:
          "If many checks become due together, batch size and concurrency control can delay a monitor by a short amount. The worker still processes it in order, but it may wait behind other due work.",
      },
      {
        question: "Does changing a monitor affect future checks immediately?",
        answer:
          "Yes. Once the monitor record is saved, the next worker cycle reads the new persisted settings. There is no separate sync layer between the UI and the worker.",
      },
      {
        question: "Can bulk edit change monitoring behavior for many sites at once?",
        answer:
          "Yes. Bulk edit writes new persisted values to every selected monitor row. The worker then reads those updated rows naturally on later cycles without any separate deployment step.",
      },
      {
        question: "What does a monitor timeline point actually represent?",
        answer:
          "Each point is a stored check result with status, code, latency, and time. The timeline is not decorative; it is derived from persisted monitor_checks rows.",
      },
    ],
  },
  {
    value: "alerts",
    label: "Alerts",
    icon: BellRing,
    accent: "text-emerald-600 dark:text-emerald-300",
    summary: "How notification decisions are made, delayed, suppressed, or routed.",
    faqs: [
      {
        question: "When does the first outage notification go out?",
        answer:
          "Not on the first failed response. Sentrovia waits for Verification Mode to confirm the outage. Only after the threshold is reached does it create the incident and dispatch notifications.",
      },
      {
        question: "What happens if no monitor-specific recipient is set?",
        answer:
          "The system falls back to the default recipient stored in Settings. If neither a monitor-specific recipient nor a workspace fallback exists, email delivery is skipped safely.",
      },
      {
        question: "Can one outage notify multiple channels?",
        answer:
          "Yes. Email, Telegram, Discord webhook, and generic webhook flows can all participate in the same delivery decision, with each outcome recorded in delivery history.",
      },
      {
        question: "What happens if a template is missing a token value?",
        answer:
          "Template rendering fills only known placeholders. Missing optional values usually resolve to an empty string or a safe fallback such as N/A instead of crashing the delivery attempt.",
      },
      {
        question: "How are status-code alerts handled when there is no code?",
        answer:
          "Timeouts, DNS failures, connection refusals, and SSL issues often have no HTTP response code. In those cases Sentrovia uses N/A and relies on RCA details instead.",
      },
      {
        question: "Can alerts be delayed without changing the monitor interval?",
        answer:
          "Yes. The monitor can still run every five minutes while Verification Mode performs separate one-minute confirmation checks before opening an incident.",
      },
      {
        question: "What decides whether an UP event sends a notification?",
        answer:
          "A healthy state only becomes a recovery notification if the monitor was previously in a confirmed failing state and workspace recovery alerts are enabled.",
      },
      {
        question: "Do company relationships change who gets alerted?",
        answer:
          "Not directly. Company assignment is mainly used for grouping, reporting, and operator workflows. Alert routing still follows monitor-level recipients and workspace channel settings.",
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
        question: "What does the Delivery page show?",
        answer:
          "It shows outbound history, retry status, destination, response codes, errors, and manual test tooling. It is the operational answer to whether a notification was actually delivered.",
      },
      {
        question: "Can I test SMTP and chat channels without triggering a real incident?",
        answer:
          "Yes. The test delivery tools can send controlled smoke-test messages through configured channels so you can validate credentials, templates, and endpoints before the next outage.",
      },
      {
        question: "How do templates work?",
        answer:
          "Templates are rendered from saved workspace defaults or monitor-level overrides. Available placeholders such as {domain}, {url_link}, {event_state}, {status_code}, {checked_at_local}, and {rca_summary} are surfaced in Settings so operators can safely customize content.",
      },
      {
        question: "Where do webhook failures go?",
        answer:
          "Webhook attempts are stored in delivery history with retry metadata, response code, and error details. The retry screen helps operators recover from temporary delivery issues without losing the original event context.",
      },
      {
        question: "Why does a test message matter if SMTP already validates credentials?",
        answer:
          "Credential validation alone does not guarantee a real message path. Test delivery confirms authentication, TLS behavior, sender identity, and remote acceptance together.",
      },
      {
        question: "Does Sentrovia save rendered emails in the database?",
        answer:
          "Delivery history stores compact operational details such as channel, state, response code, and error context. It is not designed to archive every full rendered message body forever.",
      },
      {
        question: "Can a failed delivery be retried manually?",
        answer:
          "Yes. The retry flow is intended for channel recovery scenarios where the original outage event remains valid but the first outbound attempt failed.",
      },
      {
        question: "What is the difference between default recipients and saved recipients?",
        answer:
          "Default recipients are automatic fallbacks. Saved recipients are reusable addresses operators can quickly insert into monitor-level notification settings when configuring specific monitors.",
      },
      {
        question: "How does Telegram formatting differ from email formatting?",
        answer:
          "Telegram templates are shorter and optimized for chat readability. Email templates can carry richer formatting, longer RCA context, and link-oriented phrasing.",
      },
      {
        question: "Will a channel failure block the rest of the channels?",
        answer:
          "No. Delivery attempts are recorded per channel. A failing webhook does not cancel a valid SMTP or Telegram attempt unless the event itself is suppressed before delivery begins.",
      },
      {
        question: "Can operators inspect exactly what a delivery row carried?",
        answer:
          "Yes. Delivery history is intended to expose the practical payload behind an attempt so operators can compare destination, status, response code, and message content in one place.",
      },
      {
        question: "Can a healthy UP event still include RCA details?",
        answer:
          "Yes. Recovery and successful check messages still summarize the execution outcome. For healthy responses the RCA usually explains that the endpoint completed within the expected success range.",
      },
      {
        question: "Why might a delivery row show success while the recipient still complains?",
        answer:
          "Delivered means the configured channel accepted the request. It does not always guarantee final inbox placement, downstream relay success, or chat-side permissions after acceptance.",
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
        question: "Why does Event Logs not list every healthy check one by one?",
        answer:
          "Healthy activity is intentionally summarized to keep the main log stream readable. Detailed check history still exists in the monitor timeline and database-backed uptime history.",
      },
      {
        question: "Where does dashboard data come from?",
        answer:
          "Dashboard panels read durable state from PostgreSQL, including current monitor status, worker heartbeat, events, checks, company rollups, and delivery outcomes. The browser is never the source of truth.",
      },
      {
        question: "How are company reports built?",
        answer:
          "Company reports aggregate monitor-level history and state by company relationship, then calculate health, uptime coverage, latency patterns, and monthly summaries from stored checks rather than temporary UI state.",
      },
      {
        question: "What is the difference between timeline, logs, and dashboard summaries?",
        answer:
          "Timeline is monitor-specific history, logs are cross-monitor operational events, and dashboard summaries are aggregated overviews built from the same underlying persisted data.",
      },
      {
        question: "What does the worker heartbeat row actually represent?",
        answer:
          "It is the persisted health pulse of the monitoring engine. The web console uses it to determine whether the worker is actively cycling or has gone stale.",
      },
      {
        question: "Why are some settings stored at workspace level instead of monitor level?",
        answer:
          "Workspace-level settings exist to reduce repetition and standardize behavior across large teams. They act as defaults and routing rules, while monitor rows keep site-specific intent.",
      },
      {
        question: "Can imported CSV rows stay partially empty?",
        answer:
          "Only if the missing fields can be safely filled by workspace defaults. Required monitor identity fields such as name and URL still need to be present or the row will be rejected.",
      },
      {
        question: "How long is uptime history kept?",
        answer:
          "Retention is controlled by workspace settings and database policy. The application uses that retained dataset to power timelines, company summaries, and other historical views.",
      },
      {
        question: "Does deleting a company delete its monitor history?",
        answer:
          "Removing the company relationship changes grouping and reporting, but historical monitor checks and events remain available unless explicitly deleted through separate cleanup behavior.",
      },
      {
        question: "Why does the UI sometimes refresh before a timeline changes?",
        answer:
          "The page can refresh its query before the worker finishes writing a new check row. Once the next database read occurs, the timeline catches up to the persisted state.",
      },
      {
        question: "Why are some dashboard values rounded or summarized?",
        answer:
          "Dashboard cards are optimized for fast operator reading. They intentionally summarize the underlying dataset rather than showing every raw row that exists in the database.",
      },
      {
        question: "Can saved filters and presets survive a browser restart?",
        answer:
          "Yes. Saved log filters are stored in the database for the signed-in user, so they remain available across browser sessions instead of living only in local state.",
      },
    ],
  },
  {
    value: "deployment",
    label: "Deployment",
    icon: Box,
    accent: "text-rose-600 dark:text-rose-300",
    summary: "How local mode, Docker mode, worker health, and runtime ownership work.",
    faqs: [
      {
        question: "How does Docker mode run this project?",
        answer:
          "The Docker stack runs PostgreSQL, the Next.js web console, and the worker as separate services. The worker is not simulated in the browser. Its health is inferred from heartbeat rows in the database.",
      },
      {
        question: "How can I tell if the worker is truly alive?",
        answer:
          "Dashboard and Monitoring surfaces show worker heartbeat age, last cycle time, checked count, and process state. In Docker mode, stale heartbeat is the primary sign of a worker problem.",
      },
      {
        question: "Does the worker process monitors sequentially or asynchronously?",
        answer:
          "It works in concurrency-limited batches. Due monitors are fetched from the database, reduced by batch size, and then executed asynchronously with a concurrency limit rather than one-by-one blocking behavior.",
      },
      {
        question: "Why can the UI be healthy while monitoring is stale?",
        answer:
          "Because the web console and worker are intentionally separate concerns. The UI can still load from the database even if the worker has stalled or stopped refreshing heartbeat and check schedules.",
      },
      {
        question: "Why does the first Docker build take a while?",
        answer:
          "The initial build installs dependencies, compiles the Next.js application, and prepares the worker runtime. After those layers are cached, later builds are noticeably faster.",
      },
      {
        question: "Can I run only the database in Docker and the rest locally?",
        answer:
          "Yes. That is useful in development, but the full db + web + worker Docker stack is easier to share with others because it reduces local environment drift.",
      },
      {
        question: "What happens if the worker container restarts?",
        answer:
          "The worker resumes from persisted state. Because check schedules, incidents, and heartbeat are stored in PostgreSQL, the runtime can continue from database truth rather than in-memory state.",
      },
      {
        question: "Does the web application spawn the worker automatically?",
        answer:
          "In Docker mode the worker is its own service, so the preferred model is explicit container ownership. The console reflects worker health rather than pretending to execute checks itself.",
      },
      {
        question: "Why is localhost different inside Docker?",
        answer:
          "Inside containers, services communicate over the Docker network. That is why the application uses service names such as db instead of localhost when containers talk to each other.",
      },
      {
        question: "What should I share in the README for open-source users?",
        answer:
          "The cleanest onboarding is a one-command Docker workflow plus a separate local-dev path. That gives contributors both a fast reproducible stack and a flexible development mode.",
      },
      {
        question: "How does update detection work?",
        answer:
          "Sentrovia can read package.json from a configured GitHub repository branch. When the remote version is newer than the running version, the app surfaces a top-right update banner inside the console.",
      },
      {
        question: "Will the Update button always work automatically?",
        answer:
          "No. Automatic in-place update only works when the app runs from a writable git checkout that has git available. Docker deployments can still detect new versions, but the host usually needs a manual rebuild flow.",
      },
      {
        question: "Why does worker health depend on heartbeat instead of the browser?",
        answer:
          "Because the browser is not responsible for executing checks. Heartbeat is a persisted runtime signal from the actual worker process, so it is a more trustworthy health indicator.",
      },
      {
        question: "What should I do after changing environment variables in Docker mode?",
        answer:
          "Rebuild and restart the affected services. That ensures the running web and worker containers boot with the new configuration instead of stale startup values.",
      },
    ],
  },
];
