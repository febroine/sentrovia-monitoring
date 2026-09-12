# Changelog

All notable changes to Sentrovia are documented here. Published release tags and artifacts are immutable.

## [Unreleased]

### Documentation

- Restructured the repository landing page and documentation for clearer installation, evaluation, and contribution paths.

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

[Unreleased]: https://github.com/febroine/sentrovia-monitoring/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/febroine/sentrovia-monitoring/releases/tag/v0.1.0
