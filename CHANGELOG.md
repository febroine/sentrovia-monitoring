# Changelog

All notable changes to Sentrovia are documented here. Published release tags and artifacts are immutable.

## [Unreleased]

### Fixed

- Stopped sending a generated "unavailable" image when a monitored page cannot load.
- Attached the browser's real error page (connection refused or reset, DNS failure, certificate error) to outage alerts, instead of sending no screenshot, by capturing with full headless Chromium, which renders network error pages.
- Outage screenshots now wait for the page as long as the monitor timeout (up to 60 seconds) instead of 8 seconds, so slow sites no longer lose their screenshot. A page that is still loading is captured as-is: loading is stopped like pressing Esc, so the browser draws what the server actually sent (including a blank page when it sent nothing). No image is ever generated; when the browser cannot draw the page at all, the alert goes without a screenshot and the reason is logged.
- Added a banner to outage screenshots showing how long the page took to load (or that it did not load) and how long after the failed check it was taken, so a slow page that eventually rendered is not mistaken for a working site.
- Left the outage screenshot out when the browser finds the site responding normally (an expected status code within the monitor timeout) by the time the screenshot is taken, so a transient error such as a passing HTTP 500 is no longer shown next to a working site. The log records why. Keyword and JSON monitors, non-GET/HEAD monitors, and status-code-change alerts keep their screenshot, because a loaded page is their evidence.
- Added check delay monitoring: how long a monitor had been due before its check started. Worker Pulse shows the longest current wait and the average and maximum delay over 24 hours, and warns when a due monitor has waited two minutes (or a poll interval plus a minute, if longer) for a free slot; temporarily paused monitors never count as waiting, and a monitor edited during a pause counts as waiting only from the end of the pause; Prometheus exposes `sentrovia_monitors_oldest_due_seconds`, and the worker API returns the values per cycle and per range.
- Running checks renew their monitor lease every minute, so a check slower than its precomputed lease budget is never taken over and run twice.
- The worker checks monitors in independent slots instead of rounds. A round waited for its slowest monitor, so one site timing out or verifying held back every other monitor's next check (in a test, 10-second monitors waited up to 50 seconds), as well as delivery retries and scheduled reports. Now a freed slot is refilled right away, at most half of the slots run long verification probes, and pausing or stopping the worker lets running checks finish and release their leases. With that, verification probes again wait up to twice the monitor timeout for every monitor (the cap is 240 seconds instead of 120).
- Outage screenshots now reach the site over the monitor's IP family and with its cache-busting parameter, and the screenshot redirect probe and failure diagnostics send the same identity as the check, so none of them can see a different site than the check did. A redirect failure no longer leaves out the screenshot (also when custom expected status codes report it as an HTTP status failure), because the browser follows the redirect the monitor rejects.
- Showed the HTTP status the failed check received next to the status the browser received in the screenshot banner, so the two can be compared at a glance.
- HTTP checks and outage screenshots now identify as a desktop browser (with a "Sentrovia-Monitor" token), so firewalls and bot filters that stall or reject requests without a browser User-Agent no longer turn healthy sites into false outages, and both see the same page. Content-negotiation headers stay neutral (`Accept: */*`, no `Accept-Language`), so APIs and localised sites keep returning the same body to JSON and keyword monitors.
- Wrote the screenshot banner in the alert's notification language (the monitor's own language, or the workspace language when the monitor uses the default), matching the email and Telegram text.
- Replaced raw browser errors in "Failure screenshot skipped" log entries with a short readable reason, without terminal color codes or Playwright call logs.
- Kept outage screenshots from stalling until the capture deadline when a stylesheet that never loads blocks the first paint or page scripts keep the browser busy.
- A monitor whose database row another session keeps locked no longer stops the worker. Claims skip locked rows (`FOR UPDATE SKIP LOCKED`), so other monitors keep being checked (before, one locked row held back every monitor for as long as the lock lasted); worker database sessions give up a lock wait after one minute and a statement after five (retention cleanup is exempt for its bulk deletes); and a check that outlives its whole lease budget is abandoned, so its slot is freed and its lease expires instead of being renewed forever.
- The monitor history lock pool now has a connection for every worker slot (`WORKER_CONCURRENCY`, between 10 and 50) instead of a fixed 10, and closes idle connections after a minute, so with more than ten sites failing at once the rest no longer wait for a connection (15 simultaneous failures took 4.0 s instead of 2.1 s against PostgreSQL).
- When more sites fail at once than there are screenshot browsers, queued captures now wait for a free browser for up to one capture's budget instead of five seconds, so a shared outage no longer sends most alerts without a screenshot. The number of browsers is configurable with `SCREENSHOT_CONCURRENCY` (default 3, at most 10; each one is a Chromium process of roughly 150-300 MB).
- Alerts are sent from a notification queue (`notification_jobs`) instead of inside the check. The check only records the alert; a separate set of worker slots takes the screenshot and delivers it, so a slow capture or mail server no longer holds a check slot or keeps the monitor leased, and the monitor's next check is not delayed by its own alert. Alerts of one monitor always go out in the order they were raised (an outage alert before its recovery), an outage alert or reminder is queued only once while one is waiting, an alert that fails with an error is retried with backoff (up to five attempts), and a worker that stops mid-delivery does not send the same alert twice when another worker takes it over. Pausing, deleting or resetting the monitor drops its queued alerts, finished queue entries are removed after three days, and Worker Pulse and Prometheus (`sentrovia_notifications_queued`, `sentrovia_notifications_oldest_queued_seconds`) show how many alerts are waiting and for how long.
- Failed HTTP, keyword and JSON checks now record what they saw at the moment of failure: the server address and port they reached (also when the connection never succeeded), how long DNS, connecting, the TLS handshake and the first byte took, the step they stopped at, the redirect chain, a few response headers that tell who answered (`server`, `cf-ray`, `x-cache`, `via`, `retry-after`, …), the certificate (also one the check rejected), and the first 2,000 characters of the response body as readable text. Cookies, request headers and anything that looks like a credential are never recorded. The monitor's timeline shows it when a failed check is opened ("What the check saw"), and outage emails and Telegram messages carry a one-line summary (`Check details`, also available as the `{check_details}` template placeholder) without the body. The evidence is stored in `monitor_check_evidence` and removed together with its check; while a failure goes on unchanged it is kept once every 10 minutes (always for the check that starts a failure and whenever the failure changes).
- Every HTTP check now opens its own connection. Node keeps connections alive by default, so a check could reuse the previous check's connection: a site that had stopped accepting new connections, or had moved to a new address in DNS, could still be reported as up for as long as the old connection lived (up to the server's keep-alive time, 60-120 seconds on common servers and CDNs). Failure diagnostics and the screenshot redirect probe do the same. Response times now consistently include connecting and the TLS handshake.
- Company email addresses can now be limited to some of the company's monitors. In **Companies → Edit company**, each address is set to *All monitors* (the default, and how every existing company keeps working) or *Selected monitors*, with a searchable list of the company's monitors; the company's monitor list shows who receives each monitor's email alerts. The limits apply to alerts, test notifications and delivery retries alike. A monitor that leaves the company is removed from them, monitors assigned later reach only the addresses set to all monitors, and a monitor that no address covers falls back to its own recipients or the workspace address, so an alert is never dropped. Workspace backups keep the limits and map them to the restored monitors; an address whose monitors cannot all be matched again covers every monitor.
- Monitor and company forms now ask before discarding unsaved changes when they are closed with Escape, an outside click, the close button or Cancel; an unchanged form still closes at once.
- Limiting a company address to selected monitors is quicker: switching to *Selected monitors* starts with every monitor ticked (so the address does not go silent by accident), and the list shows "n of m selected", sorts by name, and offers Select all / Clear, search by name or URL, and *Show selected only*.
- Icon-only buttons show their name as a tooltip on hover.
- Fixed layouts that ran past the screen: dashboard cards on phones (the scrolling monitor focus strip widened every card), and on tablets and small laptops the dashboard activation strip, the companies header, the reports ranking section and the settings page, which now uses its section picker until the side navigation fits.
- System Health on the dashboard now covers only the signed-in workspace. It counted due and delayed monitors across every workspace and listed the names and targets of other workspaces' delayed monitors to any workspace administrator, so an empty workspace reported "1 active monitor is more than one interval behind schedule". Temporarily paused monitors no longer count as due.
- A monitor added in the console is scheduled for an immediate first check, like monitors added in bulk, instead of showing "Check schedule missing" until the worker reached it.
- The dashboard's offline alert links to the monitor list filtered to offline monitors (`/monitoring?status=down`).

## [0.1.7] - 2026-09-22

### Changed

- Kept monitor, company, member, and log table rows visible while refreshed data loads, with a clear updating state and disabled stale-row interactions.
- Added first-page and last-page navigation to the monitoring table and synchronized page controls with the server-confirmed page.
- Preserved direct monitoring search links when the URL query changes without a full page reload.

### Fixed

- Prevented monitoring pagination from briefly showing an empty table or stale page numbers during background requests.
- Aligned the monitoring column selector with adjacent table controls and made the page-jump field apply consistently on Enter or focus loss.
- Formatted log timestamps from ISO values in the browser so detail rows use the same local timezone as the rest of the log table.
- Preserved leading and trailing whitespace in database passwords during monitor creation and CSV import, and rejected invalid CSV boolean values instead of silently converting them to false.

### Validation

- Passed focused monitor, table-loading, log timestamp, and store tests; TypeScript checking; focused linting; a production Docker build; and browser verification of monitoring search and pagination behavior.

## [0.1.6] - 2026-09-22

### Changed

- Normalized historical author and committer metadata to the public maintainer identity while preserving commit dates and source trees.
- Consolidated the public release line on a new immutable tag after the history correction.

### Validation

- Confirmed that all 196 commits and the complete source tree are unchanged apart from identity metadata.

## 0.1.5 - 2026-09-22

### Fixed

- Kept the database-repair schema audit aligned with the monitor import history table so valid installations pass repair and release checks.

### Validation

- The focused database-repair suite passed all 6 tests after the correction.

## 0.1.4 - 2026-09-22

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

## 0.1.3 - 2026-09-17

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

## 0.1.1 - 2026-09-13

### Fixed

- Kept database-repair schema auditing aligned with all current application tables so valid workspace, security, backup, and status-page tables are no longer reported as unexpected.

### Documentation

- Restructured the repository landing page and documentation for clearer installation, evaluation, and contribution paths.
- Added a prominent native Windows NSSM quick start, refreshed the repository social preview, and improved community issue templates.

## 0.1.0 - 2026-09-12

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

[Unreleased]: https://github.com/febroine/sentrovia-monitoring/compare/v0.1.7...HEAD
[0.1.7]: https://github.com/febroine/sentrovia-monitoring/releases/tag/v0.1.7
[0.1.6]: https://github.com/febroine/sentrovia-monitoring/releases/tag/v0.1.6
