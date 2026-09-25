# Sentrovia deployment guide

This guide covers production installation, configuration safety, updates, database backups, and recovery. For the product overview and fastest installation path, start with the [README](../README.md).

## Requirements

Docker Compose is recommended for most installations. Native Windows services require Node.js 20.9 or newer, npm, NSSM in `PATH`, and a PostgreSQL database with schema-change permissions.

## Docker Compose

The installers create `.env` with strong random secrets and start PostgreSQL, the web console, and the monitoring worker.

Windows PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-docker.ps1
```

Linux or macOS:

```bash
chmod +x scripts/install-docker.sh
./scripts/install-docker.sh
```

Open [http://localhost:3000](http://localhost:3000) and complete administrator onboarding. Normal lifecycle commands are:

```bash
docker compose up -d
docker compose down
```

Do not add `-v` to `docker compose down` on a real installation. It deletes the PostgreSQL volume.

The Compose configuration intentionally refuses to initialize PostgreSQL without a generated private environment file. If a PostgreSQL volume already exists but `.env` is missing, restore the original `.env`; generating a replacement database password will not unlock the existing volume.

### Production profile

Prepare secrets without starting the local stack:

```powershell
.\scripts\install-docker.ps1 -SkipStart
```

On Linux or macOS, use `./scripts/install-docker.sh --prepare-only`. Set the public HTTPS `APP_URL` in `.env`, then start the strict production profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --wait --wait-timeout 300
```

Every tagged release publishes `latest`, major/minor, and full-version images to GitHub Container Registry. The image requires the same PostgreSQL and runtime environment described here.

## Windows services with NSSM

Run the installer from an Administrator PowerShell window:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\install-windows-nssm.ps1
```

The installer creates `.env.local` when needed, prompts for PostgreSQL, applies migrations, builds the application, and creates `sentrovia-web` and `sentrovia-worker`. Existing environment files and database records are preserved. Legacy `SentroviaWeb` and `SentroviaWorker` service names are recognized during updates.

Example remote PostgreSQL configuration:

```powershell
$DbPassword = Read-Host "PostgreSQL password" -AsSecureString
.\scripts\install-windows-nssm.ps1 `
  -AppUrl "https://monitoring.example.com" `
  -DatabaseHost "db.example.com" `
  -DatabaseUser "sentrovia" `
  -DatabaseName "sentrovia" `
  -DatabasePassword $DbPassword
```

For screenshot evidence on non-Docker servers, keep Chromium outside `node_modules`:

```bat
set "PLAYWRIGHT_BROWSERS_PATH=%CD%\.playwright-browsers"
npx playwright install chromium
```

Playwright reuses the matching cached browser and downloads only a missing required version.

## Configuration safety

- `.env` and `.env.local` are private runtime files and ignored by Git.
- `.env.example` is documentation only; never deploy its placeholder secrets.
- Docker uses `.env`; Windows NSSM uses `.env.local`.
- Back up PostgreSQL before every production update.
- Never replace `APP_ENCRYPTION_SECRET` on a live database without a credential-rotation plan.
- Set `AUTH_TRUST_PROXY_HEADERS=true` only behind a trusted proxy that sanitizes forwarded headers.
- Use `WORKER_CONNECTIVITY_TARGETS` to provide at least two reliable canaries when the defaults are unavailable from a restricted network.
- Disabling `WORKER_CONNECTIVITY_CHECK_ENABLED` removes protection against monitoring-host connectivity failures.

## Database schema

Use the schema synchronizer for normal installations and updates:

```bash
npm run db:sync
```

It detects whether the database is empty or initialized and orders the Drizzle schema push and manual SQL migrations safely. Manual migrations are recorded in `public.sentrovia_manual_migrations`, skipped on later runs, and rejected if an applied file's checksum changes. Docker runs synchronization automatically during startup.

`npm run db:push` and `npm run db:manual` remain available as lower-level maintenance commands. If a production database already contains every current manual migration and only the ledger is missing, use the advanced baseline command:

```bash
npm run db:manual:baseline
```

## Updating Sentrovia

Back up PostgreSQL before updating.

### Docker update

```bash
git fetch --tags origin
git checkout vX.Y.Z
./scripts/install-docker.sh
```

On Windows, use `.\scripts\install-docker.ps1` for the final command. The installer preserves database credentials and encryption secrets and rotates only the deployment session identifier. Users sign in again after a successful update.

For the production profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --wait --wait-timeout 300
```

### Windows NSSM update

```bat
git fetch --tags origin
git checkout vX.Y.Z
UPDATE-SENTROVIA.bat
```

If release files were copied manually, skip the Git commands and run `UPDATE-SENTROVIA.bat`. The updater validates dependencies and the build, applies migrations, restarts both services, removes known retired paths, and preserves `.env.local` and database records. It restores the previous dependencies and production build if the update fails. The full transcript is saved under `logs`.

### Automatic GitHub updates for Windows NSSM

This option checks `main` every five minutes after a push. It installs only the latest commit whose **CI** workflow completed successfully. Use it only with a Git checkout of `https://github.com/febroine/sentrovia-monitoring.git`; copied release archives are not Git checkouts.

On the server, make sure Git, Node.js, npm, NSSM, `pg_dump`, and `pg_restore` are available to the Windows **SYSTEM** account through the system `PATH`. The existing NSSM services and `.env.local` must already work. First back up PostgreSQL, fetch this version of `main`, and install it once with `UPDATE-SENTROVIA.bat` using the manual update procedure above. Verify both services before enabling the task: installation records the current Git commit as the version already running. Ensure the Git working tree is clean; ignored runtime files such as `.env.local`, `node_modules`, `.next`, screenshots, and backups stay in place. Then open Administrator PowerShell in the project directory and run once:

```powershell
.\scripts\auto-update-windows-nssm.ps1 -InstallTask
Start-ScheduledTask -TaskName "Sentrovia GitHub Auto Update"
```

Check `logs/auto-update.log` and the task's last result in Task Scheduler. A successful check with no new commit says `Already running`; a pending or failed CI says `Waiting for successful CI`. GitHub's public API needs no token for this public repository. The server makes outbound HTTPS requests to GitHub; no inbound port or GitHub runner is needed. The task records the last deployed Git commit under `logs`; keep this directory across updates.

Before switching commits, the task creates and verifies an encrypted PostgreSQL backup in `AUTOMATIC_BACKUP_DIRECTORY` (default `backups`). It never rotates these pre-update backups automatically; prune them according to your retention policy after confirming restore points. If the backup fails, deployment stops. The updater then builds, synchronizes schema, and restarts both NSSM services. If it fails, the task restores the previous Git commit and attempts to restart services, while retaining the backup for manual database recovery. It will not retry the same failed commit on every check; inspect the error and clear `logs/auto-update-failed-commit` only after fixing the cause. A newer commit is eligible automatically. If Git HEAD differs from `logs/auto-update-deployed-commit`, the task stops for manual recovery instead of assuming an interrupted update succeeded. Database migrations are not automatically reversed. Check `logs/auto-update.log` and the latest `logs/sentrovia-update-*.log` if a deployment fails.

To disable automatic updates without changing the running version:

```powershell
Disable-ScheduledTask -TaskName "Sentrovia GitHub Auto Update"
```

### Verify a release

Release tags and artifacts are immutable. Verify the checksum and GitHub build-provenance attestation before installing a downloaded archive:

```bash
sha256sum --check SHA256SUMS
gh attestation verify sentrovia-monitoring-vX.Y.Z.zip --repo febroine/sentrovia-monitoring
```

## Administrator recovery

If accounts exist but the workspace has no administrator, do not reopen onboarding. Promote an existing account from the server:

```bash
npm run auth:recover-admin -- --identifier admin@example.com
```

For Docker:

```bash
docker compose exec web npm run auth:recover-admin -- --identifier admin@example.com
```

Recovery refuses to run while an administrator exists, never creates an account, and closes the recovered account's existing sessions.

## Automatic database backups

Administrators can enable daily PostgreSQL backups under **Settings → Data**. The worker creates a PostgreSQL custom-format dump, verifies it with `pg_restore`, encrypts it with AES-256-GCM, records a SHA-256 checksum, and rotates only verified backups according to the configured retention count.

Docker stores automatic backups in the named `backups` volume. Native installations default to the `backups` directory; set `AUTOMATIC_BACKUP_DIRECTORY` to use a protected host path.

A restore is verification-only unless destructive confirmation is explicit:

```bash
npm run backup:restore -- backups/sentrovia-db-YYYY-MM-DDTHHMMSSZ.sentrovia-backup
npm run backup:restore -- backups/sentrovia-db-YYYY-MM-DDTHHMMSSZ.sentrovia-backup --restore --confirm=REPLACE_DATABASE
```

For Docker, stop application processes and run the restore as a one-off worker:

```bash
docker compose stop web worker
docker compose run --rm --no-deps worker npm run backup:restore -- /app/backups/<backup-file> --restore --confirm=REPLACE_DATABASE
docker compose up -d web worker
```

Keep `APP_ENCRYPTION_SECRET` with the backups. Losing or rotating it without a migration plan makes encrypted backups and stored credentials unreadable.

## Prometheus metrics

Set a random `METRICS_AUTH_TOKEN` of at least 32 characters to enable `GET /api/metrics`. The endpoint otherwise returns `404` and accepts only `Authorization: Bearer <token>`.

```yaml
scrape_configs:
  - job_name: sentrovia
    authorization:
      type: Bearer
      credentials: "replace-with-a-strong-token"
    static_configs:
      - targets: ["sentrovia.example.com"]
```

Metrics use bounded labels and cover worker health, monitor status and backlog, delivery outcomes, and automatic backup state. Require HTTPS and a strong token.
