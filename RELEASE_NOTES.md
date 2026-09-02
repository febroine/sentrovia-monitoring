# Sentrovia v0.3.7

## Highlights

- Added real workspace ownership and membership roles with server-enforced data isolation.
- Split member-specific appearance preferences from shared workspace operations settings.
- Added server-side monitor search, filtering, sorting, pagination, and lazy timeline loading.
- Corrected weekly and monthly report windows; manual reports now support 7-day, 30-day, and custom timezone-aware ranges.
- Added maintenance windows and temporary silences that suppress notifications while checks continue.
- Added incident acknowledgement, assignee, escalation, internal notes, and explicitly public status updates.
- Added an activation checklist derived from monitor, worker, and delivery state.
- Reduced dashboard stream work with short-lived scoped snapshots and unchanged-frame heartbeats.
- Removed the incomplete sidebar-only translation layer to keep the interface language consistent.

## Upgrade notes

Run the normal database sync before starting the web and worker processes. Migrations `0079`, `0080`, and `0081` backfill workspace ownership, create shared workspace settings, and add incident/maintenance operations without deleting existing data.

Existing user settings remain as a compatibility copy. Shared operational settings are read from the active workspace, while dashboard, appearance, timezone, and notification-language preferences stay member-specific.
