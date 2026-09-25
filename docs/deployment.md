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

For database check and repair on Windows, run `UPDATE-SENTROVIA.bat --repair` from the installation directory. The launcher detects a running Docker Compose database or uses the active NSSM release with local Node.js. The former `REPAIR-DATABASE.bat` entry point is no longer needed.

## Updating Sentrovia

For Docker, back up PostgreSQL before updating. The Windows NSSM release updater makes a verified encrypted backup before it applies database migrations.

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
UPDATE-SENTROVIA.bat
```

Run this from the original installation directory as Administrator. The Windows window shows the installed version, update stages, and live output. Choose **Install update** to install the latest **published stable GitHub Release**, not every push. It downloads the release archive and checksum, verifies SHA-256, prepares dependencies, Chromium, and the build in a new `releases` directory, and makes a verified encrypted PostgreSQL backup. It then stops both NSSM services, synchronizes the database schema, points both services to the new directory, and checks that they stay running and that `/api/health` responds. `.env.local`, the browser cache, and automatic backups remain available across releases. The update output and full transcript are saved under `logs`. Keep the window open until the update finishes.

If startup or health verification fails, the updater points both services back to their previous application directory and restarts them. **Database migrations are not reversed automatically.** Keep the pre-release `.sentrovia-backup` file and `APP_ENCRYPTION_SECRET`; restoring a database backup requires stopping the services and using `npm run backup:restore -- <backup-file> --restore --confirm=REPLACE_DATABASE` after investigating the failure. A failed update leaves the prepared release directory in place for diagnosis.

The first switch from an older checkout that does not contain this updater is a one-time bootstrap: fetch and check out `v0.1.8` (or a newer release containing this script), then run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\update-windows-nssm.ps1` as Administrator. Keep that original installation directory because it contains the updater, logs, release directories, and original browser cache. Edit the active release's `.env.local` (find its directory with `nssm get sentrovia-web AppDirectory`) when changing runtime settings; the next release copies that file.

An installation whose original directory still has the older command-line launcher needs to refresh that launcher once after updating to a release containing the GUI. From the original installation directory in an elevated PowerShell window:

```powershell
$WebService = if (Get-Service -Name sentrovia-web -ErrorAction SilentlyContinue) { "sentrovia-web" } else { "SentroviaWeb" }
$ActiveRoot = (& nssm get $WebService AppDirectory | Out-String).Trim()
Copy-Item -LiteralPath (Join-Path $ActiveRoot "UPDATE-SENTROVIA.bat") -Destination . -Force
foreach ($Name in @("update-windows-gui.ps1", "update-windows-release.ps1", "environment-utils.ps1", "nssm-service.ps1")) {
  Copy-Item -LiteralPath (Join-Path $ActiveRoot "scripts/$Name") -Destination .\scripts -Force
}
```

Use `UPDATE-SENTROVIA.bat --cli` to keep the previous command-line update flow, or `UPDATE-SENTROVIA.bat --repair` for database maintenance. For a selected stable release, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\update-windows-release.ps1 -Tag vX.Y.Z` from an elevated PowerShell session. The old in-place updater remains available for manual maintenance.

### Verify a release

Release tags and artifacts are immutable. The Windows updater verifies the release archive against its published SHA-256 manifest. For manual installation, verify the checksum and GitHub build-provenance attestation before installing a downloaded archive:

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
