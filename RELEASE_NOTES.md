# Sentrovia v0.1.0

## Highlights

- Reworked sign-in and onboarding around Sentrovia's digital-observatory identity, refreshed the dashboard, monitoring, delivery, reports, settings, help, profile, and public status experiences, and aligned the interface on a consistent English product language.
- Added configurable notification-email branding, event-specific templates, dark-mode email rendering, direct site-check links, workspace notification-language controls, and richer previews without linking recipients back into the monitoring panel.
- Hardened monitor URL handling, onboarding rate limits, member removal, workspace notification routing, retention, scheduler batching, automatic backup policy/timezone behavior, and Docker runtime cache permissions.
- Fixed stale request races, rejected sign-out behavior, monitor timeline ordering, log preset failure handling, and bounded PostgreSQL backup/restore process execution.
- Expanded unit and dynamic browser coverage, refreshed the README and demo GIF, and added isolated demo-workspace tooling.

## Upgrade notes

Back up the database before upgrading. The normal schema-sync process applies migrations 0086 through 0090. These migrations add notification headline and SSL-expiry templates, monitor-level template overrides, remove embedded credentials from stored HTTP-style monitor URLs, and persist the workspace backup timezone. Existing monitoring history is preserved.

## Validation

Validated with 829 passing tests, typecheck, lint, production build, merged Compose configuration, and the full isolated-account dynamic E2E suite. Docker web and database health checks passed, and the worker completed startup without runtime cache or migration errors.
