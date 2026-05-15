<p align="center">
  <img src="docs/screenshots/banner.png" alt="Sentrovia" width="100%">
</p>

> Sentrovia is a self-hosted monitoring and operations console for teams that need verified alerts, durable runtime state, scheduled reports, and a readable control plane for internal services.

<p align="left">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16.2-black?style=flat-square&logo=next.js" />
  <img alt="React" src="https://img.shields.io/badge/React-19-0f172a?style=flat-square&logo=react" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-First-2563eb?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-16-0f172a?style=flat-square&logo=postgresql" />
  <img alt="Windows Service" src="https://img.shields.io/badge/Windows-NSSM-059669?style=flat-square" />
  <img alt="Worker Runtime" src="https://img.shields.io/badge/Worker-DB%20Backed-0f766e?style=flat-square" />
</p>

## ✨ Overview

Sentrovia is designed for internal IT and operations teams that want more than a simple "ping and alert" tool. It combines a Next.js web console, a dedicated worker runtime, and PostgreSQL-backed state so the dashboard, logs, notifications, reports, and worker status all read from the same durable source of truth.

The product focuses on practical production behavior:

- ✅ verified outage confirmation before noisy first-failure alerts
- ⏱️ one-minute rechecks while a failure is being confirmed
- 🧠 escalating verification timeouts to reduce false positives
- 📬 recovery notifications after confirmed outages return healthy
- 👥 multi-recipient monitor notifications
- 🔔 SMTP, Telegram, Discord, and generic webhook delivery
- 🧾 delivery history, retry visibility, and report delivery tracking
- 🏢 company-aware monitor ownership
- 📊 reports with HTML, CSV, and PDF attachments
- 🌐 public status pages for selected monitor visibility

## 🖼️ Product Screens

### Dashboard + Monitoring

<table>
  <tr>
    <td width="50%">
      <img src="./docs/screenshots/dashboard.png" alt="Sentrovia dashboard" />
    </td>
    <td width="50%">
      <img src="./docs/screenshots/monitoring.png" alt="Sentrovia monitoring view" />
    </td>
  </tr>
  <tr>
    <td>
      <sub>Live operational summaries, worker visibility, runtime state, and recent event context.</sub>
    </td>
    <td>
      <sub>Monitor inventory with verification state, bulk actions, history strips, active toggles, and company assignment.</sub>
    </td>
  </tr>
</table>

### Delivery + Help

<table>
  <tr>
    <td width="50%">
      <img src="./docs/screenshots/delivery.png" alt="Sentrovia delivery operations" />
    </td>
    <td width="50%">
      <img src="./docs/screenshots/help.png" alt="Sentrovia help page" />
    </td>
  </tr>
  <tr>
    <td>
      <sub>Delivery testing, immutable delivery history, webhook retries, and outbound channel visibility.</sub>
    </td>
    <td>
      <sub>In-product operational documentation that explains how the runtime behaves in production.</sub>
    </td>
  </tr>
</table>

<p align="center">
  <img src="./docs/screenshots/about.png" alt="Sentrovia about page" />
</p>

<p align="center">
  <sub>The About page explains the architecture, worker behavior, report flow, notifications engine, and the execution path from browser input to persisted result.</sub>
</p>

## 🚀 Core Capabilities

### 🛰️ Monitoring engine

- HTTP and HTTPS availability checks
- keyword and JSON assertion monitors
- TCP port reachability checks
- PostgreSQL connectivity checks
- ICMP ping checks
- cron and heartbeat endpoint monitoring
- per-monitor interval, timeout, retry, method, redirect, SSL, cache, and response-size controls
- per-monitor active or disabled state
- verification mode for delayed outage confirmation
- cold-start spread for imported monitors
- optional screenshot evidence on confirmed HTTP, keyword, and JSON outages
- check history, event history, and timeline details
- diagnostics for DNS, TCP, TLS, HTTP, timeout, and status-code failures

### 🔔 Notification routing

- SMTP email delivery
- multiple email recipients per monitor
- saved recipient shortcuts in Settings
- Telegram delivery
- Discord webhook delivery
- generic webhook delivery
- workspace-level notification templates
- monitor-level template overrides
- separate down, recovery, status-change, and prolonged-downtime templates
- delivery history with status, attempt count, response code, and error details

### 📊 Reports

- weekly and monthly reports
- workspace-wide and company-scoped reports
- manual preview before send
- scheduled report delivery through the worker
- report template editor
- configurable subject and intro templates
- summary, monitor breakdown, incident context, and detail-level controls
- HTML, CSV, and PDF attachments

### 🛡️ Operations and governance

- company records and grouped monitor ownership
- member directory
- settings and appearance controls
- filtered event logs and saved log presets
- worker heartbeat, backlog, cycle metrics, and health state
- public status pages
- workspace backup and restore

## 🧭 Runtime Model

```mermaid
flowchart LR
    A["Operator uses Web Console"] --> B["Validated Route Handlers"]
    B --> C["PostgreSQL stores settings and monitor state"]
    C --> D["Worker claims due monitors and report schedules"]
    D --> E["HTTP / Keyword / JSON / TCP / PostgreSQL / ICMP / Heartbeat checks"]
    E --> F{"Check failed?"}
    F -- "No" --> G["Persist UP result and clear failure state"]
    F -- "Yes" --> H["Enter or continue verification mode"]
    H --> I{"Verification threshold reached?"}
    I -- "No" --> J["Schedule one-minute recheck"]
    I -- "Yes" --> K["Run final confirmation with longer timeout"]
    K --> L["Persist confirmed outage, RCA, diagnostics, and timeline"]
    L --> M["Render templates and send notifications"]
    G --> N["Dashboard / Logs / Reports / Public Status"]
    J --> D
    M --> N
```

### 🖥️ Web console

The web layer is the control plane. It handles authentication, monitor configuration, settings, companies, members, logs, delivery tools, reports, public status pages, and dashboard reads.

### ⚙️ Worker

The worker is the execution engine. It claims due monitors, applies batch and concurrency rules, performs checks, handles verification mode, records results, sends notifications, retries delivery queues, and dispatches scheduled reports.

### 🗄️ PostgreSQL

PostgreSQL persists users, companies, monitors, checks, events, diagnostics, incident timeline entries, delivery events, worker state, cycle metrics, report schedules, public status settings, templates, and notification preferences.

## ✅ Verification Mode

Sentrovia avoids alerting on the first transient failure:

1. A monitor fails once.
2. The monitor moves into verification mode.
3. Follow-up checks run at one-minute intervals.
4. Recheck timeout increases during verification to reduce false positives.
5. If the configured threshold is reached, Sentrovia runs a final confirmation check.
6. If the final confirmation still fails, the outage is confirmed and a down notification is sent.
7. If the monitor recovers before confirmation, no down notification is sent.
8. After a confirmed outage recovers, a recovery notification is sent.

This means "down" and "recovered" emails are tied to confirmed state transitions instead of raw single checks.

## 🧪 Failure Diagnostics

When a monitor fails or enters verification mode, Sentrovia can record a diagnostic snapshot with:

- DNS resolution result
- resolved IP addresses
- TCP connection result
- TLS negotiation result
- HTTP response result
- failed phase and failure category
- timeout used for the diagnostic
- operator-facing summary and raw error message

These records appear alongside monitor history and incident timeline events so operators can understand why an alert fired from the server's point of view.

## ⚡ Quick Start

### Docker Compose

Run the full stack:

```bash
docker compose up --build
```

This starts:

- PostgreSQL
- the Next.js web console
- the background worker

The Docker boot flow waits for PostgreSQL, applies the schema, starts the web runtime, and starts the worker after the web container is healthy.

Open:

- [http://localhost:3000](http://localhost:3000)

### Local development

If you want PostgreSQL in Docker but run the app locally:

```bash
docker compose up -d db
npm install
npm run db:push
npm run dev
```

Start the worker in a second terminal:

```bash
npm run worker:dev
```

## 🔐 Environment

Create `.env.local` in the project root.

Typical values:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5433/uptimemonitoring
APP_URL=http://localhost:3000
AUTH_SECRET=replace-with-a-strong-32-character-secret
APP_ENCRYPTION_SECRET=replace-with-a-strong-32-character-encryption-secret
WORKER_CONCURRENCY=20
WORKER_POLL_INTERVAL_MS=10000
WORKER_AUTO_START=false
DISABLE_EMBEDDED_WORKER_SPAWN=false
AUTH_ALLOW_PUBLIC_SIGNUP=false
PLAYWRIGHT_BROWSERS_PATH=0
```

Production notes:

- `AUTH_SECRET` and `APP_ENCRYPTION_SECRET` must be strong non-placeholder values.
- `APP_URL` should match the URL operators use to open Sentrovia.
- The web and worker processes must use the same `.env.local` values.
- `WORKER_AUTO_START=true` is useful when the worker should begin checking immediately after first boot.
- `AUTH_ALLOW_PUBLIC_SIGNUP=false` is recommended for production. In production, Sentrovia allows the first account to be created, then blocks public signup once a user exists.
- Set `AUTH_ALLOW_PUBLIC_SIGNUP=true` only temporarily if you intentionally want to reopen public registration.
- `PLAYWRIGHT_BROWSERS_PATH=0` keeps the Chromium browser inside the project dependencies so NSSM services can find it reliably.

## 🧱 Database Updates

For a normal schema sync:

```bash
npm run db:push
```

Manual migrations that may be needed on older servers:

```bash
drizzle/0029_notification_template_overrides_manual.sql
drizzle/0030_reports_v2_indexes_manual.sql
drizzle/0031_diagnostics_incident_timeline_manual.sql
drizzle/0032_monitor_email_recipients_manual.sql
```

If you copied only part of the project to a server, make sure the `drizzle` folder is updated too. Reports v2, diagnostics, timeline entries, and multi-recipient monitor alerts depend on those migration files.

## 🪟 Windows Production With NSSM

NSSM runs Sentrovia as two Windows services:

- `sentrovia-web`
- `sentrovia-worker`

The web service runs the Next.js production server. The worker service runs monitor checks, verification rechecks, notification delivery, webhook retries, and scheduled reports.

### Prerequisites

Install these on the Windows server:

- Node.js 20.9 or newer
- npm
- PostgreSQL access
- NSSM, with `nssm.exe` available in `PATH`
- a complete `.env.local` file in the project root
- internet or internal package mirror access for npm packages and Playwright Chromium

Verify from `cmd`:

```bat
node -v
npm -v
nssm version
```

### First-time setup

From the project root:

```bat
scripts\setup-production-windows-nssm.bat
```

The setup script will:

- check `node`, `npm`, `nssm`, and `.env.local`
- install dependencies
- install the Playwright Chromium browser
- apply the database schema
- build the production app
- create `sentrovia-web`
- create `sentrovia-worker`
- configure service working directories and log files
- start both services

Logs are written to:

```bat
logs\sentrovia-web.log
logs\sentrovia-web-error.log
logs\sentrovia-worker.log
logs\sentrovia-worker-error.log
```

### Manual NSSM setup

If you prefer to create services manually, run these commands from the project root after `npm install`, `set PLAYWRIGHT_BROWSERS_PATH=0`, `npx playwright install chromium`, `npm run db:push`, and `npm run build`.

Find the Node path:

```bat
where node
```

Create the web service:

```bat
nssm install sentrovia-web "C:\Program Files\nodejs\node.exe"
nssm set sentrovia-web AppDirectory "C:\path\to\sentrovia-monitoring-main"
nssm set sentrovia-web AppParameters "scripts\bootstrap-runtime.mjs web"
nssm set sentrovia-web AppEnvironmentExtra NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=0
nssm set sentrovia-web Start SERVICE_AUTO_START
nssm set sentrovia-web AppStdout "C:\path\to\sentrovia-monitoring-main\logs\sentrovia-web.log"
nssm set sentrovia-web AppStderr "C:\path\to\sentrovia-monitoring-main\logs\sentrovia-web-error.log"
```

Create the worker service:

```bat
nssm install sentrovia-worker "C:\Program Files\nodejs\node.exe"
nssm set sentrovia-worker AppDirectory "C:\path\to\sentrovia-monitoring-main"
nssm set sentrovia-worker AppParameters "scripts\bootstrap-runtime.mjs worker"
nssm set sentrovia-worker AppEnvironmentExtra NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=0
nssm set sentrovia-worker Start SERVICE_AUTO_START
nssm set sentrovia-worker AppStdout "C:\path\to\sentrovia-monitoring-main\logs\sentrovia-worker.log"
nssm set sentrovia-worker AppStderr "C:\path\to\sentrovia-monitoring-main\logs\sentrovia-worker-error.log"
```

Start both services:

```bat
nssm start sentrovia-web
nssm start sentrovia-worker
```

Check status:

```bat
nssm status sentrovia-web
nssm status sentrovia-worker
```

## 🔄 Updating An NSSM Server

Use this flow when Sentrovia is already running on another Windows server and active monitors exist.

1. Back up PostgreSQL or take a VM/server snapshot.
2. Stop the worker first so no checks are running while files and schema change.
3. Update the full project folder, not only `src`.
4. Install dependencies.
5. Apply schema changes.
6. Build.
7. Start the web service.
8. Start the worker service.

Commands:

```bat
nssm stop sentrovia-worker
nssm stop sentrovia-web

npm install
set PLAYWRIGHT_BROWSERS_PATH=0
npx playwright install chromium
npm run db:push
npm run build

nssm start sentrovia-web
nssm start sentrovia-worker
```

Or use the bundled update script after the files are updated:

```bat
scripts\update-production-windows-nssm.bat
```

Important update notes:

- Do not copy only `src`; dependency, migration, script, and lockfile changes can be required.
- Copy or pull `package.json`, `package-lock.json`, `drizzle`, `scripts`, `public`, `src`, and config files together.
- Run `npm install` after updates because dependencies such as PDF/report tooling can change.
- Run `set PLAYWRIGHT_BROWSERS_PATH=0` and `npx playwright install chromium` when screenshot evidence is enabled or after a fresh dependency install on a new server.
- Run `npm run build` before starting services.
- Start the worker last. The web app can be available while the worker catches up.
- If the worker was disabled in the UI before the update, it will remain logically paused through database state.

## 🧰 Useful Commands

```bat
nssm status sentrovia-web
nssm status sentrovia-worker
nssm restart sentrovia-web
nssm restart sentrovia-worker
nssm stop sentrovia-worker
nssm start sentrovia-worker
```

Application checks:

```bash
npm run test
npm run lint
npm run build
npm audit --audit-level=high --omit=dev
```

## 📜 Scripts

- `npm run dev` starts the Next.js dev server
- `npm run build` creates a production build
- `npm run start` starts the production web server
- `npm run worker:dev` starts the worker with file watching
- `npm run worker:start` starts the worker process
- `npm run lint` runs ESLint
- `npm run test` runs the Vitest test suite
- `npm run db:generate` generates Drizzle migrations
- `npm run db:push` pushes the current schema to PostgreSQL
- `scripts\setup-production-windows-nssm.bat` creates the Windows NSSM services
- `scripts\update-production-windows-nssm.bat` updates an existing Windows NSSM deployment

## 🧩 Tech Stack

- Next.js 16
- React 19
- TypeScript
- Drizzle ORM
- PostgreSQL
- Zod
- Zustand
- Nodemailer
- PDFKit
- Vitest
- Docker Compose
- NSSM for Windows service hosting

## 🗺️ Project Status

Sentrovia is already usable as an internal monitoring and operations console. Good next steps for the platform include:

- escalation policies
- maintenance windows
- DNS-specific monitors
- multi-region worker checks
- richer HTTP assertions
- audit export tools
- role-based access controls
