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
  "If monitors look stale, open Worker Insights first and check heartbeat, backlog, and recent errors.",
  "If a notification did not arrive, inspect Delivery before changing monitor settings.",
  "If you updated the code and behavior looks odd, restart the affected web and worker processes before debugging deeper.",
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
        question: "What is Verification Mode?",
        answer:
          "Verification Mode starts after the first failure. Instead of confirming an outage immediately, Sentrovia schedules one-minute confirmation checks and waits until the configured threshold is reached.",
      },
      {
        question: "What does the retries field control right now?",
        answer:
          "Retries act as the confirmation threshold inside Verification Mode. If a monitor is configured for four attempts, Sentrovia performs up to four one-minute verification failures before it confirms the outage.",
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
          "If many checks become due together, batch size and concurrency control can delay a monitor briefly. The worker still processes it from persisted due state, but it may wait behind other due work.",
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
    label: "Worker Insights",
    icon: Radar,
    accent: "text-sky-600 dark:text-sky-300",
    summary: "How the worker runs, what the observability dashboard means, and how to read pressure correctly.",
    faqs: [
      {
        question: "What does Worker Insights show?",
        answer:
          "It shows backlog pressure, checks per hour, failures per day, the latest cycle duration, recent cycles, failing monitors, and recent worker-level errors. It is intended to explain worker quality, not just whether the process exists.",
      },
      {
        question: "What is due backlog?",
        answer:
          "Due backlog is the number of checks waiting to be claimed by the worker. A growing backlog usually means the worker is under-sized, blocked by errors, or temporarily behind the workspace load.",
      },
      {
        question: "What does checks per hour mean?",
        answer:
          "It is a short operational throughput metric derived from recent worker activity. It helps you judge whether the worker is keeping up with the monitoring load over time.",
      },
      {
        question: "Why is heartbeat important if the UI is still open?",
        answer:
          "Because the browser does not execute checks. Heartbeat is a persisted signal from the real worker process, so it is the trustworthy indicator of whether monitoring is actually alive.",
      },
      {
        question: "What does recent cycles represent?",
        answer:
          "Each recent cycle row shows how many monitors completed, how long the cycle took, how much backlog existed at the start, and how many results were up, pending, or down.",
      },
      {
        question: "What should I do when recent worker errors appear?",
        answer:
          "Start with the worker status card, then inspect recent errors, due backlog, and failing monitors together. If the worker is offline or stale, restart it and confirm the database schema and runtime env are current.",
      },
      {
        question: "Why was Slow Monitors removed from this dashboard?",
        answer:
          "The worker dashboard is now focused on execution pressure and failure visibility. Latency still exists in monitor views and reports, but the dedicated worker surface prioritizes backlog, reliability, and scheduler health.",
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
          "Sentrovia currently supports email, Telegram, Discord webhook, and generic webhooks. Slack and maintenance-window controls are no longer part of the active product surface.",
      },
      {
        question: "Can I test channels without triggering a real outage?",
        answer:
          "Yes. The Delivery area includes test tooling so you can validate SMTP, Telegram, Discord, and webhook destinations without waiting for a real monitor failure.",
      },
      {
        question: "Where do webhook failures go?",
        answer:
          "Webhook attempts are stored in delivery history with retry metadata, response codes, and error details. The retry workflow helps recover from temporary delivery problems without losing the original event context.",
      },
      {
        question: "Can a failed delivery be retried manually?",
        answer:
          "Yes. Manual retry is intended for channel recovery scenarios where the original monitoring event is still valid but the first outbound attempt failed.",
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
          "You can generate weekly or monthly reports, either for the whole workspace or for a single company. The same page also previews summaries, sends reports immediately, and manages recurring schedules.",
      },
      {
        question: "What is the difference between Preview Studio and Schedule Manager?",
        answer:
          "Preview Studio is for on-demand generation and manual send. Schedule Manager is for recurring delivery, search and filtering, toggling active state, loading a schedule back into the builder, and sending scheduled reports immediately.",
      },
      {
        question: "What is included in a generated report?",
        answer:
          "A report includes monitor count, current state mix, uptime percentage, average latency, failure count, status-code distribution, top failing monitors, latency watchlist, and a ranked monitor breakdown for the selected period.",
      },
      {
        question: "Can I create company-specific reports?",
        answer:
          "Yes. Company-scoped reporting is built in. Choose company scope, select the target company, and Sentrovia limits the report to that company’s monitors and history.",
      },
      {
        question: "How are scheduled reports delivered?",
        answer:
          "Scheduled reports are picked up by the worker during its loop. Active schedules whose next run time is due are rendered and sent through email delivery to the configured recipient list.",
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
        question: "Can I tell if the worker is truly alive?",
        answer:
          "Yes. Dashboard and Monitoring surfaces show worker heartbeat age, last cycle time, checked count, process state, backlog, and recent worker errors. In Docker mode, stale heartbeat is still the clearest sign of a worker problem.",
      },
      {
        question: "What happens if the worker container restarts?",
        answer:
          "The worker resumes from persisted state. Because schedules, check history, heartbeat, and worker metrics are stored in PostgreSQL, the runtime continues from database truth rather than in-memory assumptions.",
      },
      {
        question: "How should I update a Docker deployment?",
        answer:
          "Pull the latest repository changes on the host, run npm run db:push if the release adds schema changes, then rebuild and restart the containers with docker compose up --build -d.",
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
        question: "Do saved filters and presets survive a browser restart?",
        answer:
          "Yes. User-facing saved settings live in the database for the signed-in user, so they remain available across browser sessions instead of existing only in local browser state.",
      },
    ],
  },
];
