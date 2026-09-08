# Sentrovia v0.3.8

## Highlights

- Added workspace operations for maintenance, incident coordination, delivery, and activation guidance.
- Hardened worker redirect validation, monitor leases, workspace access boundaries, and backup archive handling.
- Updated vulnerable build dependencies.
- Redesigned first-run workspace setup and administrator creation for a clearer, accessible onboarding flow.
- Expanded Help and About product guidance.
- Added Chromium installation to CI so screenshot coverage runs reliably on GitHub Actions.

## Upgrade notes

Run the normal database sync before starting the web and worker processes. Existing installations should review their configured backup storage permissions before upgrading.
