# Changelog

All notable changes to Sentrovia are documented here. Published release tags and artifacts are immutable.

## [Unreleased]

## [0.1.5] - 2026-09-22

### Fixed

- Kept the database-repair schema audit aligned with the monitor import history table so valid installations pass repair and release checks.

### Validation

- The focused database-repair suite passed all 6 tests after the correction.

## [0.1.4] - 2026-09-22

### Added

- Added permission-aware global search and quick actions for monitors, companies, members, logs, and reports.
- Added report KPI drilldowns so summary values can be inspected down to the contributing monitors.
- Added CSV import history with row-level correction, downloadable error files, and safe undo for the latest completed import.

### Changed

- Added URL-backed search state to monitoring, company, member, log, and report views so search results can open directly in the relevant context.
- Recorded monitor import runs and their created monitor IDs for auditable recovery, with cleanup during backup restoration.

### Fixed

- Allowed CSV rows with missing trailing cells to be corrected during import preview by padding them to the header width.

### Validation

- Completed targeted tests, type checking, focused linting, a production Docker build, and browser verification of the affected user flows.

## [0.1.3] - 2026-09-17

### Added

- Added monitor sorting by name, status, latency, last check, or creation date with stable pagination.
- Added export of all monitors matching the current search, company, status, and sort filters.
- Added bulk company assignment and public status visibility updates for selected monitors.
- Added CSV and text import previews with duplicate, quota, and network-policy checks.
- Added declarative monitor configuration import updates with redacted-secret preservation.
- Added retry for selected failed delivery records with partial-result reporting.

### Fixed

- Kept monitors without latency or check timestamps at the end of metric-based sort results.
- Rejected duplicate monitor IDs in bulk company operations.
- Prevented applying a monitor configuration preview while invalid records remain.
- Ensured monitor history reset removes all monitor-owned report and operational records, including legacy records with stale workspace scope.
- Refreshed open report analytics and previews after a monitor history reset and prevented stale concurrent responses from replacing newer results.
- Redirected authenticated users away from sign-in and completed onboarding pages without rendering stale authentication screens.
- Preserved protected-page query parameters through sign-in and redirected invalidated sessions instead of leaving protected pages blank.

### Validation

- Release checks completed tests, lint, type checking, and a production build.

### Security

- Enforced the `audit.read` permission for event-log reads and deletion so lower-privileged workspace roles cannot access restricted operational history.
- Revoked existing session tokens during sign-out by advancing the account session version while still clearing the local cookie on failures.

## [0.1.1] - 2026-09-13

### Fixed

- Kept database-repair schema auditing aligned with all current application tables so valid workspace, security, backup, and status-page tables are no longer reported as unexpected.

### Documentation

- Restructured the repository landing page and documentation for clearer installation, evaluation, and contribution paths.
- Added a prominent native Windows NSSM quick start, refreshed the repository social preview, and improved community issue templates.

## [0.1.0] - 2026-09-12

### Added

- HTTP/HTTPS, API/JSON, keyword, TCP, ICMP ping, PostgreSQL, and heartbeat monitoring.
- Failure verification with retry thresholds, monitoring-host connectivity checks, and a final confirmation probe.
- Screenshot evidence for supported confirmed failures, monitor timelines, public status pages, reliability reports, and auditable notification delivery.
- SMTP email, Telegram, Discord webhook, and generic webhook delivery with bounded retries and dead-letter visibility.
- Workspace roles, encrypted database backups, Prometheus metrics, Docker Compose deployment, and native Windows service deployment.

### Changed

- Reworked sign-in and onboarding around Sentrovia's digital-observatory identity and aligned the application interface on English product language.
- Added configurable notification branding, event-specific templates, dark-mode email rendering, direct site-check links, and English or Turkish notification content.
- Hardened monitor URL handling, onboarding rate limits, member removal, workspace notification routing, retention, scheduler batching, automatic backup behavior, and Docker runtime permissions.

### Fixed

- Fixed stale request races, rejected sign-out behavior, monitor timeline ordering, log preset failure handling, and bounded PostgreSQL backup/restore process execution.

### Upgrade notes

- Back up PostgreSQL before upgrading.
- The normal schema sync applies migrations 0086 through 0090. These add notification headline and TLS-expiry templates, monitor-level template overrides, remove embedded credentials from stored HTTP-style monitor URLs, and persist the workspace backup timezone.
- Existing monitoring history is preserved.

### Validation

- Release CI completed tests, lint, type checking, scale benchmark smoke testing, and a production build before publishing the source archive and Docker image.

[Unreleased]: https://github.com/febroine/sentrovia-monitoring/compare/v0.1.5...HEAD
[0.1.5]: https://github.com/febroine/sentrovia-monitoring/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/febroine/sentrovia-monitoring/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/febroine/sentrovia-monitoring/compare/v0.1.2...v0.1.3
[0.1.1]: https://github.com/febroine/sentrovia-monitoring/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/febroine/sentrovia-monitoring/releases/tag/v0.1.0
