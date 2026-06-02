<p align="center">
  <img src="docs/screenshots/banner.png" alt="Sentrovia" width="100%">
</p>

# Sentrovia

Self-hosted monitoring for teams that want fewer false alarms, stronger evidence, and a clean operations console.

Sentrovia monitors websites, APIs, TCP ports, PostgreSQL endpoints, ping targets, JSON assertions, keyword checks, and heartbeat jobs. It verifies failures before alerting, stores worker state in PostgreSQL, sends rich email and Telegram notifications, captures Chromium screenshots for confirmed outages, and can publish public status pages and scheduled reports.

<p align="left">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16.2-black?style=flat-square&logo=next.js" />
  <img alt="React" src="https://img.shields.io/badge/React-19-0f172a?style=flat-square&logo=react" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-First-2563eb?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-16-0f172a?style=flat-square&logo=postgresql" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-Compose-2563eb?style=flat-square&logo=docker&logoColor=white" />
  <img alt="Windows Service" src="https://img.shields.io/badge/Windows-NSSM-059669?style=flat-square" />
</p>

## Why Sentrovia?

Most small monitoring tools answer one question: "Did this check fail?"

Sentrovia is built for the next operational question: "Is it really down, what evidence do we have, who was notified, and what happened afterwards?"

- Verified outage confirmation before down alerts
- One-minute rechecks while a failure is being confirmed
- Escalating verification timeouts to reduce false positives
- Slow-response alerts without marking the service down
- Screenshot evidence after confirmed HTTP, keyword, and JSON outages
- Email, Telegram, Discord, and generic webhook delivery
- Multiple email recipients per monitor
- Delivery history, retry visibility, and failed delivery details
- Public status pages
- Scheduled reports with HTML, CSV, and PDF attachments
- Windows NSSM service deployment for internal servers

## Quick Start With Docker

Docker Compose is the fastest way to try Sentrovia.

```bash
cp .env.example .env
# Edit .env and set strong AUTH_SECRET, APP_ENCRYPTION_SECRET, and POSTGRES_PASSWORD values.
docker compose up --build
```

Then open:

[http://localhost:3000](http://localhost:3000)

The Compose stack starts:

- PostgreSQL
- the Next.js web console
- the background worker
- Playwright Chromium for screenshot evidence

The web container waits for PostgreSQL, applies the database schema, applies manual migrations, and then starts the application. The worker starts after the web service is healthy.

Compose requires strong secrets in an `.env` file before it starts:

```bash
AUTH_SECRET=replace-with-a-strong-32-character-secret
APP_ENCRYPTION_SECRET=replace-with-a-strong-32-character-encryption-secret
APP_URL=http://localhost:3000
POSTGRES_PASSWORD=replace-with-a-strong-database-password
```

## Product Screens

### Dashboard and Monitoring

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
      <sub>Live operational summaries, worker health, runtime state, recent incidents, and system visibility.</sub>
    </td>
    <td>
      <sub>Monitor inventory with verification state, bulk actions, active toggles, history strips, and company assignment.</sub>
    </td>
  </tr>
</table>

### Delivery and Help

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
      <sub>Delivery testing, immutable delivery history, webhook retries, and outbound channel diagnostics.</sub>
    </td>
    <td>
      <sub>Built-in operational documentation for checks, workers, reports, notification behavior, and troubleshooting.</sub>
    </td>
  </tr>
</table>

<p align="center">
  <img src="./docs/screenshots/about.png" alt="Sentrovia about page" />
</p>

<p align="center">
  <sub>The About page explains the architecture, worker behavior, report flow, notification engine, and execution path from browser input to persisted result.</sub>
</p>

## Core Capabilities

### Monitoring engine

- HTTP and HTTPS checks
- Keyword assertions
- JSON path assertions
- TCP port reachability checks
- PostgreSQL connectivity checks
- ICMP ping checks
- Cron and heartbeat monitoring
- Per-monitor interval, timeout, retry, method, redirect, SSL, cache, and response-size controls
- Per-monitor active or disabled state
- Cold-start spread for imported monitors
- Verification mode before down alerts
- Slow-response threshold with degraded status
- Check history, event history, diagnostics, and timeline details

### Alerting and evidence

- SMTP email alerts
- Multiple monitor recipients
- Telegram alerts
- Discord webhook alerts
- Generic webhook delivery
- Workspace-level templates
- Monitor-level template overrides
- Down, recovery, status-change, latency, and prolonged-downtime templates
- Chromium screenshot evidence for confirmed HTTP, keyword, and JSON outages
- Delivery history with status, attempts, response code, payload summary, and error details

### Reports and status pages

- Weekly and monthly reports
- Workspace-wide and company-scoped reports
- Manual report preview
- Scheduled report delivery through the worker
- Configurable report brand name
- HTML, CSV, and PDF attachments
- Public status pages with operational, degraded, and outage states

### Operations and governance

- Company records and grouped monitor ownership
- Member directory
- Settings and appearance controls
- Saved log presets
- Worker heartbeat, backlog, cycle metrics, and health state
- Workspace backup and restore
- Security hardening for auth, exports, webhooks, heartbeat routes, and redirects

## How Verification Works

Sentrovia avoids noisy first-failure alerts.

```mermaid
flowchart LR
    A["Worker checks monitor"] --> B{"Check failed?"}
    B -- "No" --> C["Persist UP result"]
    B -- "Yes" --> D["Enter verification mode"]
    D --> E["Recheck every 1 minute"]
    E --> F{"Threshold reached?"}
    F -- "No" --> E
    F -- "Yes" --> G["Run final confirmation with larger timeout"]
    G --> H{"Still failing?"}
    H -- "No" --> C
    H -- "Yes" --> I["Confirm outage"]
    I --> J["Record RCA, diagnostics, timeline"]
    J --> K["Send alerts with optional screenshot evidence"]
```

That means down emails are tied to confirmed state transitions, not one unlucky timeout.

## Screenshot Evidence

Sentrovia can attach browser screenshots to confirmed outage alerts.

- Captured only after verification confirms the outage
- Available for HTTP, keyword, and JSON monitors
- Uses Playwright Chromium
- Captures Chromium's own network error page when the target cannot load
- Best effort: the alert still goes out if Chromium fails
- Queue and concurrency limits protect the worker from too much browser work
- Skipped screenshots are recorded as `screenshot-skipped` monitor events

Production note for non-Docker servers:

```bat
set PLAYWRIGHT_BROWSERS_PATH=0
npx playwright install chromium
```

## Sentrovia vs Uptime Kuma

Uptime Kuma is excellent when you want a lightweight, friendly uptime dashboard.

Sentrovia is aimed at teams that need a more operations-heavy internal workflow:

| Area | Uptime Kuma | Sentrovia |
| --- | --- | --- |
| Basic uptime checks | Strong | Strong |
| Verification before down alerts | Limited | Built around it |
| One-minute failure rechecks | Basic retry behavior | Explicit verification cycle |
| Slow response vs down | Basic latency visibility | Separate degraded/slow alert path |
| Screenshot evidence | Not a core workflow | Built into confirmed outage alerts |
| Reports | Limited | Scheduled HTML, CSV, PDF reports |
| Delivery history | Limited | Stored delivery events and retry visibility |
| Windows NSSM deployment | Manual | Documented scripts and service model |
| Internal operations console | Lightweight | Designed for durable worker state and auditability |

If you need a simple public uptime page, Uptime Kuma may be enough. If you need verified alerts, screenshot evidence, report delivery, and Windows-friendly internal deployment, Sentrovia is designed for that niche.

## Local Development

Run PostgreSQL in Docker and the app locally:

```bash
docker compose up -d db
npm install
npm run db:push
npm run db:manual
npm run dev
```

Start the worker in a second terminal:

```bash
npm run worker:dev
```

## Environment

Create `.env.local` in the project root.

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
- `AUTH_ALLOW_PUBLIC_SIGNUP=false` is recommended for production.
- `PLAYWRIGHT_BROWSERS_PATH=0` helps NSSM services find Chromium reliably.
- Set `AUTH_TRUST_PROXY_HEADERS=true` only if a trusted reverse proxy sanitizes forwarded IP headers.

## Windows Production With NSSM

Sentrovia runs as two NSSM services:

- Service name: `sentrovia-web`
- Service name: `sentrovia-worker`

The Windows display names are `Sentrovia Web` and `Sentrovia Worker`.

### Prerequisites

- Node.js 20.9 or newer
- npm
- PostgreSQL access
- NSSM in `PATH`
- `.env.local` in the project root
- Internet or internal mirror access for npm packages and Playwright Chromium

### First-time setup

Use the PowerShell installer:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-windows-nssm.ps1 -RecreateServices
```

This checks prerequisites, installs dependencies, installs Playwright Chromium, applies schema and manual migrations, builds the app, creates both NSSM services, and starts them.

### Updating an existing NSSM server

After copying or pulling the new files:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-windows-nssm.ps1
```

The script stops both services, updates dependencies, applies schema and manual migrations, rebuilds, and starts the services again.

The older batch helpers are still available:

```bat
scripts\setup-production-windows-nssm.bat
scripts\update-production-windows-nssm.bat
```

Logs are written to:

```bat
logs\sentrovia-web.log
logs\sentrovia-web-error.log
logs\sentrovia-worker.log
logs\sentrovia-worker-error.log
```

Useful service commands:

```bat
nssm status sentrovia-web
nssm status sentrovia-worker
nssm restart sentrovia-web
nssm restart sentrovia-worker
nssm stop sentrovia-worker
nssm start sentrovia-worker
```

## GitHub Release Checklist

To make Sentrovia easier to download, publish a GitHub Release for each meaningful version.

1. Commit and push the final changes.
2. Open the repository on GitHub.
3. Go to **Releases**.
4. Click **Draft a new release**.
5. Create a tag such as `v0.2.0`.
6. Use a clear title such as `Sentrovia v0.2.0`.
7. Add release notes:
   - key features
   - migration files to run
   - Docker command
   - Windows NSSM update command
   - Playwright Chromium note
8. Publish the release.

Suggested first release note:

```text
Sentrovia v0.2.0

- Verification-aware monitoring engine
- HTTP, keyword, JSON, TCP, ping, PostgreSQL, and heartbeat monitors
- Email, Telegram, Discord, and webhook delivery
- Screenshot evidence for confirmed outages
- Public status pages
- Scheduled reports with HTML, CSV, and PDF attachments
- Docker Compose quick start
- Windows NSSM installer and updater
```

## Commands

```bash
npm run dev
npm run build
npm run start
npm run worker:dev
npm run worker:start
npm run lint
npm run test
npm run db:push
npm run db:manual
```

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- PostgreSQL
- Drizzle ORM
- Zod
- Zustand
- Nodemailer
- Telegram Bot API
- Playwright Chromium
- PDFKit
- Vitest
- Docker Compose
- NSSM

## Project Status

Sentrovia is usable today as an internal monitoring and operations console. It is especially suited for Windows-heavy teams, internal IT departments, and environments where operators need verified alerts instead of noisy first-failure notifications.

Good next steps:

- signed release builds
- demo video or GIF
- hosted demo instance
- role-based access controls
- maintenance windows
- escalation policies
- multi-region workers
- DNS-specific monitors

## License

MIT
