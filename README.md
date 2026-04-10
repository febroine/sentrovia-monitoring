# Sentrovia

> A verification-aware monitoring platform for teams that want cleaner alerts, durable runtime state, and a control plane that stays readable under real operational load.

<p align="left">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js" />
  <img alt="React" src="https://img.shields.io/badge/React-19-0f172a?style=flat-square&logo=react" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-First-2563eb?style=flat-square&logo=typescript&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-16-0f172a?style=flat-square&logo=postgresql" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-Compose-0891b2?style=flat-square&logo=docker" />
  <img alt="Worker Runtime" src="https://img.shields.io/badge/Worker-DB%20Backed-059669?style=flat-square" />
</p>

## What Sentrovia is

Sentrovia is built for self-hosted teams that want more than a simple "ping and alert" tool.

It combines:

- a **Next.js web console** for configuration, operations, logs, delivery testing, and user workflows
- a **dedicated worker runtime** for actual monitor execution
- **PostgreSQL** as the source of truth for configuration and runtime state
- a **verification mode** that reduces noisy first-failure alerting
- **company-aware visibility** for grouped monitors and operational ownership
- **delivery history** so teams can see what the system actually tried to send

## Why teams would pick Sentrovia

### ✅ Verification-aware incident handling

Sentrovia does not immediately treat the first failure as a real outage.  
The worker can move a monitor into **verification mode**, re-check at one-minute intervals, and only confirm the incident after the configured threshold is reached.

### ✅ Durable, database-first state

Checks, incidents, monitor history, worker heartbeat, companies, settings, templates, and delivery attempts are stored in PostgreSQL so every page reads the same persisted truth.

### ✅ Internal control plane feel

This project is designed more like an operations console than a toy dashboard:

- dashboard summaries
- monitor timelines
- event logs
- delivery history
- company rollups
- members and settings
- worker health visibility

### ✅ Multiple monitor types

Sentrovia currently supports:

- `HTTP / HTTPS`
- `TCP / Port`
- `PostgreSQL`

All monitor types use the same core pipeline for verification, RCA, event creation, and delivery.

## Product Screens

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
      <sub>Live operational summaries, worker visibility, and recent event context.</sub>
    </td>
    <td>
      <sub>Monitor inventory with verification state, bulk actions, history strips, and company assignment.</sub>
    </td>
  </tr>
</table>

### Delivery + Documentation

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
      <sub>Delivery testing, history inspection, retry workflows, and outbound channel visibility.</sub>
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
  <sub>About Sentrovia explains the architecture, runtime model, update awareness, and the actual execution path from browser input to persisted result.</sub>
</p>

## Core Capabilities

### 🔎 Monitoring engine

- HTTP/HTTPS monitor execution
- TCP/port reachability checks
- PostgreSQL connectivity checks
- per-monitor timeout, retries, method, redirects, SSL behavior, and response settings
- verification mode for delayed incident confirmation
- check history with timeline surfaces

### 🧠 Root cause analysis

Sentrovia classifies failures into targeted RCA buckets such as:

- DNS resolution failures
- timeout failures
- connection refused
- SSL/TLS issues
- HTTP 4xx
- HTTP 5xx
- redirect anomalies
- generic network failures

### 🔔 Delivery and notification routing

- SMTP email delivery
- Telegram delivery
- Slack webhook delivery
- Discord webhook delivery
- generic webhook delivery
- delivery history and retry visibility
- workspace-level templates and recipient defaults
- maintenance-window-aware suppression

### 🧰 Operations and governance

- companies and grouped monitor ownership
- members directory
- settings with defaults and templates
- event logs with filters
- worker heartbeat and health status
- GitHub-based update awareness

## How it works

```mermaid
flowchart LR
    A["Operator uses Web Console"] --> B["Validated Route Handlers"]
    B --> C["PostgreSQL stores monitor + settings state"]
    C --> D["Worker polls due monitors"]
    D --> E["HTTP / TCP / PostgreSQL checks"]
    E --> F{"Failure?"}
    F -- "No" --> G["Persist UP result + history"]
    F -- "Yes" --> H["Enter verification mode"]
    H --> I{"Threshold reached?"}
    I -- "No" --> J["Schedule 1-minute confirmation check"]
    I -- "Yes" --> K["Persist incident + RCA + events"]
    K --> L["Render templates + route delivery"]
    G --> M["Dashboard / Logs / Timelines / Reports"]
    J --> D
    L --> M
```

## Runtime model

### Web console

The web layer is the control plane. It is responsible for:

- creating and updating monitors
- reading dashboards and logs
- editing settings, templates, members, and companies
- rendering live operational views
- exposing authenticated APIs for the worker and the UI

### Worker

The worker is the execution engine. It is responsible for:

- selecting due monitors
- building checks from saved monitor settings
- applying batch size and concurrency rules
- running verification mode
- writing history, status, and event records
- sending notifications through enabled channels
- writing heartbeat and worker state back to the database

### Database

PostgreSQL is not just storage; it is the operational backbone. It persists:

- users
- companies
- monitors
- monitor checks
- monitor events
- delivery events
- worker state
- settings and templates
- maintenance windows

## Verification mode

One of the most important behaviors in Sentrovia is the verification flow:

1. A monitor fails once.
2. The worker does **not** immediately open a real incident.
3. The monitor enters **verification mode**.
4. Follow-up checks run at one-minute intervals.
5. If the failure repeats until the threshold is reached, the incident is confirmed.
6. If the monitor comes back up before the threshold is reached, the verification state is cleared and the monitor returns to its normal schedule.

This is a major difference from many lighter monitoring tools that alert on the first transient failure.

## GitHub update awareness

Sentrovia can detect that a newer version exists in a GitHub repository.

It compares:

- the local `package.json` version
- the remote `package.json` version from `APP_UPDATE_REPO`

This lets the UI surface a **new version available** banner in supported runtimes.

Important note:

- update detection works well in git-based checkouts
- Docker deployments can still detect new versions
- automatic apply usually still requires a host-level rebuild or restart flow

## Quick Start

### 🚀 Full Docker setup

Run the full stack:

```bash
docker compose up --build
```

This starts:

- `db` for PostgreSQL
- `web` for the Next.js application
- `worker` for background monitoring execution

Open:

- [http://localhost:3000](http://localhost:3000)

### 🧪 Local development

If you want PostgreSQL in Docker but run the app locally:

1. Start the database:

```bash
docker compose up -d db
```

2. Apply the schema:

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
AUTH_SECRET=replace-this-in-production
APP_ENCRYPTION_SECRET=replace-with-a-32-byte-secret
WORKER_CONCURRENCY=20
WORKER_POLL_INTERVAL_MS=10000
WORKER_AUTO_START=false
DISABLE_EMBEDDED_WORKER_SPAWN=false
APP_UPDATE_REPO=febroine/sentrovia-monitoring
APP_UPDATE_BRANCH=main
ENABLE_IN_PLACE_UPDATES=true
```

For Docker Compose, the services already inject the internal database host and worker flags they need.

## Scripts

- `npm run dev` starts the Next.js dev server
- `npm run build` creates a production build
- `npm run start` starts the production server
- `npm run worker:dev` starts the worker with file watching
- `npm run worker:start` starts the worker once
- `npm run lint` runs ESLint
- `npm run db:generate` generates Drizzle migrations
- `npm run db:push` pushes the current schema to PostgreSQL

## Tech stack

- **Next.js 16** for the app shell, pages, and route handlers
- **React 19** for client-side interfaces
- **TypeScript** across web, worker, and services
- **Drizzle ORM** for schema and queries
- **PostgreSQL** for durable state
- **Zod** for validation
- **Zustand** for focused UI state
- **Nodemailer** for SMTP delivery
- **Docker Compose** for self-hosted orchestration

## Project status

Sentrovia is already strong as an internal monitoring and operations console, but it is still evolving.

Natural next steps for the platform include:

- additional monitor types like DNS, keyword, JSON assertion, and push monitors
- public status pages
- escalation policies
- multi-region checks
- incident ownership workflows

---
