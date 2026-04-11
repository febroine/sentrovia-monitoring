# Sentrovia

> A verification-aware, self-hosted monitoring platform with a dedicated worker runtime, durable PostgreSQL state, customizable alerting, reports, and an operations-focused control plane.

<p align="left">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" />
  <img alt="React" src="https://img.shields.io/badge/React-19-0f172a?style=flat-square&logo=react" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-First-2563eb?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-16-0f172a?style=flat-square&logo=postgresql" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-Compose-0891b2?style=flat-square&logo=docker" />
  <img alt="Worker Runtime" src="https://img.shields.io/badge/Worker-DB%20Backed-059669?style=flat-square" />
</p>

## What Sentrovia is

Sentrovia is built for self-hosted teams that want more than a basic uptime checker.

It combines:

- a **Next.js web console** for monitor management, settings, reports, help content, backup/restore, and operations workflows
- a **dedicated worker runtime** for executing checks, verification mode, history writes, and outbound notifications
- **PostgreSQL** as the source of truth for monitors, users, worker state, delivery history, reports, and settings
- a **verification-first outage model** that avoids noisy first-failure alerts
- **customizable notifications** across email, Telegram, Discord, and generic webhooks
- **reports and worker insights** so teams can understand both monitored systems and the monitoring engine itself

## Core capabilities

### Monitor types

Sentrovia currently supports:

- `HTTP / HTTPS`
- `Keyword`
- `JSON Assertion`
- `TCP / Port`
- `PostgreSQL`
- `Ping / ICMP`
- `Cron / Heartbeat`

### Alerting and delivery

- verification-aware `down` and `recovery` notifications
- configurable repeated `still down` reminders
- customizable email and Telegram templates
- SMTP email delivery
- Telegram delivery
- Discord webhook delivery
- generic webhook delivery
- delivery history and webhook retry visibility

### Operations

- worker start/stop controls
- worker health and observability dashboard
- monitor history and event timelines
- bulk actions and tags
- monitoring as code import/export
- backup and restore
- members directory
- update awareness for GitHub-based releases

### Reporting

- weekly reports
- monthly reports
- company-scoped reports
- global workspace reports
- report preview
- scheduled report delivery

## Product surfaces

Sentrovia currently includes:

- `Dashboard`
- `Monitoring`
- `Companies`
- `Logs`
- `Delivery`
- `Reports`
- `Members`
- `Settings`
- `Help`
- `About`

## Runtime model

### Web console

The web layer is the control plane. It is responsible for:

- creating and updating monitors
- reading dashboards, logs, reports, and worker metrics
- editing settings, templates, companies, members, and update config
- exposing authenticated APIs for the UI and worker runtime

### Worker

The worker is the execution engine. It is responsible for:

- selecting due monitors
- running HTTP, TCP, PostgreSQL, ICMP, and heartbeat checks
- applying verification mode before confirming an outage
- persisting check history and event records
- sending notifications through enabled channels
- recording worker pulse and cycle metrics
- running scheduled report delivery jobs

### Database

PostgreSQL persists the operational truth for:

- users
- companies
- monitors
- monitor checks
- monitor events
- delivery events
- webhook endpoints
- worker state
- worker cycle metrics
- report schedules
- user settings

## Verification model

One of the most important Sentrovia behaviors is the verification flow:

1. A monitor fails once.
2. The worker does **not** immediately treat that as a confirmed outage.
3. The monitor enters **verification mode**.
4. Follow-up checks run at one-minute intervals.
5. If the failure repeats until the configured threshold is reached, the outage is confirmed and the first down notification is sent.
6. If the service comes back before the threshold is reached, verification is cleared and no outage notification is sent.
7. If the service stays down, optional prolonged-downtime reminders can continue on the interval you configure.
8. When the service becomes healthy again, a recovery notification is sent.

## Reports

The reports center supports:

- weekly summaries
- monthly summaries
- company-scoped reports
- global workspace reports
- schedule management
- recipient lists
- manual preview and send-now flows

The worker is responsible for sending due scheduled reports.

## Worker insights

Sentrovia includes a worker observability surface that tracks:

- due backlog
- checks per hour
- failures per day
- last cycle timing
- recent worker cycles
- failing monitors
- recent worker-level errors

This makes it easier to debug the monitoring engine itself, not just the systems being monitored.

## Update awareness

Sentrovia can detect when a newer version exists in GitHub.

It compares:

- the local `package.json` version
- the remote `package.json` version from the configured update repository

You can configure this through:

- environment variables like `APP_UPDATE_REPO`
- or the in-app **Settings > Data > App Updates** panel

Notes:

- Docker deployments can detect that a newer version exists
- applying the update still usually requires a host-level `git pull` plus rebuild/restart
- the UI can show the current version, remote version, and last check state

## Quick start

### Full Docker setup

Run the full stack:

```bash
docker compose up --build
```

This starts:

- `db` for PostgreSQL
- `web` for the Next.js app
- `worker` for background checks and scheduled jobs

Then open:

- [http://localhost:3000](http://localhost:3000)

For a fresh clone, the Docker flow is intended to be low-friction:

- PostgreSQL boots automatically
- the web runtime starts on port `3000`
- the worker starts inside its own service
- local-only default secrets are already present in the compose setup so signup/login works in local Docker

### Local development

If you want PostgreSQL in Docker but run the app locally:

1. Start the database:

```bash
docker compose up -d db
```

2. Push the schema:

```bash
npm run db:push
```

3. Start the web app:

```bash
npm run dev
```

4. Start the worker in another terminal:

```bash
npm run worker:dev
```

## Environment

Start from `.env.example` and create `.env.local`.

Typical local values:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5433/uptimemonitoring
APP_URL=http://localhost:3000
AUTH_SECRET=local-dev-auth-secret-change-before-public-deploy-2026
APP_ENCRYPTION_SECRET=local-dev-encryption-secret-change-before-public-deploy-2026
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=uptimemonitoring
WORKER_CONCURRENCY=20
WORKER_POLL_INTERVAL_MS=10000
WORKER_AUTO_START=false
DISABLE_EMBEDDED_WORKER_SPAWN=false
APP_UPDATE_REPO=febroine/sentrovia-monitoring
APP_UPDATE_BRANCH=main
ENABLE_IN_PLACE_UPDATES=true
```

For Docker Compose:

- the compose services already inject the database host and worker flags they need
- local-only default secrets are included for convenience
- for any real deployment, replace them with strong values

## Required follow-up after schema changes

Some newer features add database columns and tables, including:

- reports
- worker observability metrics
- app update configuration
- prolonged downtime reminders

If you pull a newer version outside the Docker bootstrap flow, run:

```bash
npm run db:push
```

## Notifications

Sentrovia supports:

- first confirmed outage alerts
- recovery alerts
- latency alerts
- SSL expiry alerts
- status code change alerts
- prolonged downtime reminders

Template tokens available in notification templates include:

- `{domain}`
- `{url}`
- `{url_link}`
- `{event_state}`
- `{status_code}`
- `{status_label}`
- `{checked_at_local}`
- `{downtime_started_at_local}`
- `{downtime_duration}`
- `{downtime_minutes}`
- `{downtime_hours}`
- `{rca_summary}`
- `{organization}`

## GitHub update flow for Docker users

If your local Docker deployment says a new version is available, the typical host-side update flow is:

```bash
git pull
npm run db:push
docker compose up --build -d
```

If there were no schema changes, `npm run db:push` may be unnecessary, but it is the safe path after pulling a newer release.

## Scripts

- `npm run dev` starts the Next.js dev server
- `npm run build` creates a production build
- `npm run start` starts the production server
- `npm run worker:dev` starts the worker with file watching
- `npm run worker:start` starts the worker once
- `npm run lint` runs ESLint
- `npm run db:generate` generates Drizzle migrations
- `npm run db:push` pushes the current schema to PostgreSQL
- `npm run docker:web` runs the web bootstrap flow used in Docker
- `npm run docker:worker` runs the worker bootstrap flow used in Docker

## Tech stack

- **Next.js 16**
- **React 19**
- **TypeScript**
- **Drizzle ORM**
- **PostgreSQL**
- **Zod**
- **Zustand**
- **Nodemailer**
- **Docker Compose**

## Security notes

Recent hardening in the app includes:

- member management now shows all users but only allows editing or deleting your own account
- workspace restore validates the full payload before destructive writes and restores inside a transaction
- webhook and Discord endpoints are checked against unsafe local/private targets before they are stored or called

## Project status

Sentrovia is already a capable internal monitoring and operations console. Natural next steps include:

- DNS monitor support
- public status pages
- RBAC if the product moves beyond single-admin workspace assumptions
- richer HTTP assertion support
- branded export formats for reports

---

Self-hosted teams that want a database-backed monitoring control plane with a dedicated worker runtime, customizable alerts, and reports can clone the repo and get productive quickly.
