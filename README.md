# Sentrovia

Sentrovia is a worker-driven monitoring platform built for self-hosted teams that want durable operational state, verification-aware incident confirmation, and readable delivery history in one console.

It combines:

- a Next.js web console
- a separate worker runtime
- PostgreSQL as the source of truth
- workspace defaults, company rollups, monitor timelines, and delivery history

## What Sentrovia Monitors

Sentrovia currently supports:

- `HTTP / HTTPS` monitors
- `TCP / Port` monitors
- `PostgreSQL` monitors

Each monitor type flows through the same verification, RCA, event logging, and notification pipeline.

## Quick Start

### Full Docker Setup

Run the full stack with one command:

```bash
docker compose up --build
```

This starts:

- `db` for PostgreSQL
- `web` for the Next.js application
- `worker` for background monitoring checks

Open [http://localhost:3000](http://localhost:3000).

### Local Development Setup

If you want to run the app locally while keeping PostgreSQL in Docker:

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

4. Start the worker in a second terminal:

```bash
npm run worker:dev
```

## Environment

Use `.env.local` for local development and start from `.env.example`.

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

For Docker Compose, the services already inject the correct internal database host and worker flags.

## Update Awareness

Sentrovia can detect when a newer version has been pushed to its GitHub repository.

The in-app update banner works by comparing:

- the local `package.json` version
- the remote `package.json` version from `APP_UPDATE_REPO`

Automatic in-place update only works when the app runs from a writable git checkout with git installed. Docker deployments still detect updates, but usually need a rebuild or restart on the host.

## Scripts

- `npm run dev` starts the Next.js dev server
- `npm run build` creates a production build
- `npm run start` starts the production server
- `npm run worker:dev` starts the worker with file watching
- `npm run worker:start` starts the worker once
- `npm run lint` runs ESLint
- `npm run db:generate` generates Drizzle migrations
- `npm run db:push` pushes the current schema to PostgreSQL

## Architecture Notes

- The web console is the control plane for monitors, companies, members, settings, delivery, logs, and reports.
- The worker is the execution engine for due-monitor selection, checking, verification mode, RCA, and delivery decisions.
- PostgreSQL stores monitor configuration, worker heartbeat, checks, events, company relationships, settings, and delivery outcomes.
- Verification mode prevents a single transient failure from instantly creating a real incident.
- Maintenance windows suppress outbound alerts without deleting operational visibility.

## Open Source Notes

- Do not commit `.env.local`
- Do not commit real secrets or database dumps
- The recommended onboarding path for contributors is the Docker workflow because it avoids local environment drift
