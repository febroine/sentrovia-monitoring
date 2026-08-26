# Sentrovia Pre-Production Security Audit

**Assessment date:** 25 August 2026  
**Assessment target:** current local working tree  
**Stack:** Next.js 16 / React / TypeScript / PostgreSQL / Drizzle ORM / Zod / JOSE / bcrypt / Playwright / Docker / Windows NSSM  
**Assessment mode:** source review plus safe local dynamic verification

## Executive summary

Sentrovia has a stronger security baseline than a typical early self-hosted monitoring product. Authorization is enforced server-side, database access is user-scoped, SQL is parameterized, the monitor worker has substantial SSRF controls, secrets use authenticated encryption, onboarding is race-safe, and the release workflow pins third-party actions and emits checksums and attestations.

The review confirmed **12 findings: 0 Critical, 1 High, 6 Medium, and 5 Low**. The highest-risk issue is support for credentials embedded in HTTP monitor URLs. Those credentials are stored as part of the URL and can be returned through normal monitor APIs and exports. This creates a practical secret-disclosure path for any deployment that uses URL userinfo for Basic Authentication.

The medium findings concern secret re-disclosure through monitor serialization, non-revoking logout, an unused onboarding rate-limit rule, incomplete resource limits on expensive operations, deployment-dependent `Secure` cookie behavior, and overly privileged default Windows services. No confirmed cross-user IDOR, SQL injection, stored/reflected DOM XSS, unauthenticated admin takeover, general-purpose SSRF bypass, command injection, path traversal, or dependency vulnerability was found.

### Severity totals

| Severity | Count |
| --- | ---: |
| Critical | 0 |
| High | 1 |
| Medium | 6 |
| Low | 5 |
| Informational / manual verification | 7 |

### Immediate priorities

1. Reject URL userinfo and migrate/redact existing monitor URLs.
2. Stop returning decrypted heartbeat and Telegram tokens from monitor APIs.
3. Add revocable sessions and persistent limits for onboarding and expensive outbound operations.
4. Require HTTPS-safe production cookie configuration and install Windows services under a dedicated low-privilege account.

## Scope and methodology

### In scope

- All files under `src/app`, `src/components`, `src/lib`, and `src/worker` relevant to request handling, authentication, authorization, rendering, database access, outbound connections, notifications, backups, and updates.
- Drizzle schema and migration behavior.
- Docker Compose and Windows NSSM deployment scripts.
- GitHub Actions release and CI configuration.
- Public status pages, heartbeat endpoints, metrics, login, onboarding, worker execution, screenshot capture, reports, delivery channels, and backup/restore.
- OWASP Top 10:2025 and OWASP API Security Top 10:2023 mappings.

### Out of scope and safety limits

- No destructive restore was performed.
- No denial-of-service load test was performed.
- No real email, Telegram, webhook, PostgreSQL, or arbitrary Internet target received test traffic.
- No browser or operating-system exploit was attempted.
- Reverse-proxy, filesystem ACL, repository settings, and production network controls that are not represented in this repository require deployment-side verification.
- Findings were documented before remediation, as required by the assessment brief.

### Verification completed

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — 96 files and 550 tests passed.
- `npm run build` — passed; 54 application routes built.
- Targeted security tests — 11 files and 92 tests passed.
- `npm audit --json` — 0 known vulnerabilities across 597 dependencies at assessment time.
- Docker web, worker, and database services started successfully; database and web health checks passed.
- Safe HTTP checks confirmed unauthenticated redirects, origin enforcement, malformed JSON rejection, metrics fail-closed behavior, heartbeat token fail-closed behavior, and security headers.
- Static scans found no `dangerouslySetInnerHTML`, direct `innerHTML`, `eval`, or `new Function` usage.
- Repository and history scans found no tracked production `.env`, private key, GitHub token, or AWS access-key pattern.

## Architecture and trust boundaries

### Components

| Component | Responsibility | High-value assets |
| --- | --- | --- |
| Next.js web process | UI, API routes, auth, settings, reports, backup orchestration | Session cookies, user data, encrypted secrets, backup access |
| Worker process | Monitor scheduling, HTTP/TCP/Ping/Postgres checks, screenshots, notification delivery | Decrypted target/channel credentials, browser process, outbound network access |
| PostgreSQL | Persistent users, sessions-by-version, monitors, results, logs, settings | Password hashes, encrypted secrets, monitor history, audit data |
| Browser/Playwright | Screenshot evidence for HTTP monitors | Network reachability, parsed remote content |
| Public endpoints | Login, onboarding state, health, optional metrics, heartbeat, status pages | Authentication boundary, public availability data |
| Docker/NSSM | Process isolation and host service lifecycle | Host filesystem, service account, environment secrets |
| GitHub release workflow | Builds archives/images and publishes releases | Build integrity, release tag, package checksums |

### Trust boundaries

1. **Browser to web:** all input is untrusted. Session, origin, media type, size, and schema checks apply.
2. **Web to database:** server code is trusted; row ownership and role authorization must remain enforced on every query.
3. **Web/worker to monitored targets:** destinations and responses are hostile. DNS, redirects, IP classes, timeouts, size limits, and browser navigation require SSRF controls.
4. **Worker to notification providers:** channel configuration and remote responses are untrusted; credentials are sensitive and outbound calls must be bounded.
5. **Public Internet to public endpoints:** no cookie can be assumed. Rate limits and non-disclosing error behavior are required.
6. **Container/service to host:** a process compromise inherits its container or Windows service identity.
7. **GitHub to updater/operator:** release metadata and downloaded artifacts cross a software supply-chain boundary.

## External attack surface and route inventory

Authorization labels below describe the effective minimum role. `Owner` means the authenticated user can access only rows in their own workspace. Mutation permissions are also enforced in `src/proxy.ts`; route/service checks remain necessary defense in depth.

| Method | Route | Access | Primary inputs | Sensitive behavior / output |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/login` | Public | JSON email/password, IP/proxy headers | Sets signed session cookie; persistent rate limiting |
| POST | `/api/auth/logout` | Authenticated | Session cookie, Origin | Clears browser cookie; does not revoke token (SEC-003) |
| GET | `/api/auth/onboarding` | Public | None | Reveals whether initial setup is available |
| POST | `/api/auth/onboarding` | Public while no user exists | Admin profile/password | Creates first admin under advisory lock; missing limiter use (SEC-004) |
| GET | `/api/auth/session` | Authenticated | Session cookie | Returns current user/session profile |
| POST | `/api/auth/change-password` | Authenticated | Current/new password | Rotates password hash and invalidates session version |
| GET | `/api/health` | Public | None | Minimal health response, no-store |
| GET | `/api/metrics` | Token-gated or 404 | Bearer token | Runtime metrics; disabled unless strong token configured |
| GET | `/api/monitors/heartbeat/[token]` | Public | Path token | Explicitly returns 405; avoids browser-triggered heartbeat |
| POST | `/api/monitors/heartbeat/[token]` | Public, token possession | Path token | Records heartbeat; lacks per-token throttle (SEC-005) |
| GET | `/status/[slug]` | Public when enabled | Slug | Published availability and sanitized target labels |
| GET, POST | `/api/companies` | Owner read / Operator+ write | Company fields | Lists or creates user-scoped companies |
| PATCH, DELETE | `/api/companies/[id]` | Operator+ owner | UUID, company fields | Updates/deletes owner-scoped company |
| POST | `/api/companies/bulk` | Operator+ owner | UUID/action list | Bulk company changes |
| POST | `/api/companies/restore` | Operator+ owner | Deleted company UUID | Restores soft-deleted company |
| GET | `/api/companies/[id]/report` | Owner | UUID | Company-scoped report data |
| GET | `/api/companies/[id]/monthly-report` | Owner | UUID | Monthly company report |
| GET, PATCH | `/api/dashboard/preferences` | Authenticated self | Widget/scope preferences | Reads/updates own dashboard preferences |
| GET | `/api/dashboard/stream` | Authenticated owner | Session, SSE connection | Streams owner-scoped dashboard state |
| GET | `/api/delivery` | Owner | Query filters | Notification delivery history |
| PATCH, DELETE | `/api/delivery` | Operator+ owner | Delivery IDs/state | Updates/deletes owner-scoped delivery rows |
| POST | `/api/delivery/retry` | Operator+ owner | Delivery ID | Re-sends a prior delivery |
| POST | `/api/delivery/test` | Operator+ | Channel and target config | Makes outbound test delivery; expensive flow (SEC-005) |
| GET, DELETE | `/api/logs` | Authenticated read / Manager+ delete | Filters, pagination | Reads/clears workspace audit/operational logs |
| GET, POST, DELETE | `/api/logs/presets` | Authenticated self | Preset JSON/name | Manages own filter presets |
| GET, POST, DELETE | `/api/members` | Manager+ for management | User fields/ID | Lists, creates, or deletes permitted members |
| PATCH | `/api/members/[id]` | Self or authorized Manager+ | UUID, profile/role | Self profile change or constrained role management |
| GET, POST, DELETE | `/api/monitors` | Owner read / Operator+ write | Filters; monitor config; IDs | Monitor CRUD; serializer secret exposure (SEC-001/002) |
| PATCH, DELETE | `/api/monitors/[id]` | Operator+ owner | UUID, monitor config | Updates/deletes owner-scoped monitor |
| PATCH | `/api/monitors/[id]/active` | Operator+ owner | UUID, boolean | Enables/disables monitor |
| PATCH | `/api/monitors/[id]/flags` | Operator+ owner | favorite/critical/publish flags | Updates display/publication flags |
| PATCH | `/api/monitors/bulk` | Operator+ owner | IDs/action | Bulk monitor operation |
| PATCH | `/api/monitors/tags` | Operator+ owner | IDs/tags | Bulk tag update |
| GET | `/api/monitors/history` | Owner | Monitor ID/range | Returns owner-scoped results/history |
| POST | `/api/monitors/import` | Operator+ owner | Structured monitor array | Imports monitors after validation |
| POST | `/api/monitors/restore` | Operator+ owner | Deleted monitor ID | Restores owner-scoped monitor |
| POST | `/api/monitors/test` | Operator+ | Monitor target/config | Performs immediate outbound check; expensive flow (SEC-005) |
| GET | `/api/monitors/config/export` | Owner | Query selection | Exports monitor config, including URL userinfo if present (SEC-001) |
| POST | `/api/monitors/config/import` | Operator+ owner | Config document | Imports validated monitor configuration |
| POST | `/api/notifications/preview` | Operator+ | Template and sample fields | Renders notification preview; React/escaping controls apply |
| GET, POST | `/api/public-status-pages` | Owner read / Operator+ write | Page config/company scope | Lists/creates user-scoped status pages |
| PATCH, DELETE | `/api/public-status-pages/[id]` | Operator+ owner | UUID/page config | Updates/deletes owner-scoped page |
| GET, POST | `/api/reports` | Owner read / Operator+ write | Schedule/report config | Lists/creates report definitions |
| PATCH, DELETE | `/api/reports/[id]` | Operator+ owner | UUID/report config | Updates/deletes report definition |
| POST | `/api/reports/[id]/duplicate` | Operator+ owner | UUID | Duplicates owner-scoped report |
| POST | `/api/reports/[id]/send` | Operator+ owner | UUID | Sends report; expensive outbound flow (SEC-005) |
| POST | `/api/reports/preview` | Operator+ | Report config | Renders report preview |
| POST | `/api/reports/send` | Operator+ | Report config/recipients | Sends ad-hoc report; expensive flow (SEC-005) |
| GET, PATCH | `/api/settings` | Owner read / Operator+ write | Settings JSON | Reads/updates workspace settings and encrypted secrets |
| GET | `/api/system` | Admin | None | Host/runtime details |
| GET | `/api/system/health` | Admin | None | Internal component health |
| GET | `/api/system/backup/export` | Admin | Format/options | Creates/downloads encrypted workspace or DB backup |
| POST | `/api/system/backup/restore` | Admin | Backup, approval token/options | Previews/restores validated backup |
| GET | `/api/updates` | Admin | None | Fetches fixed GitHub release metadata and instructions |
| GET, POST | `/api/worker` | Admin | Worker action/config | Reads/controls worker lifecycle state |

## Input validation review

| Input class | Validation and limits | Storage / sink | Assessment |
| --- | --- | --- | --- |
| JSON request bodies | `readJsonBody` checks media type and bounded stream; Zod validates shapes | Service functions / DB | Strong baseline; unknown Zod keys are stripped and server mappings are explicit |
| Email/password | Normalized email; password 12–128 with complexity; bcrypt cost 12 | User table / bcrypt | Strong; login uses dummy hash and persistent throttling |
| UUIDs and IDs | Zod UUID validation or typed path parsing; queries combine `userId` | Owner-scoped DB rows | No confirmed IDOR |
| Slugs, names, labels | Length/pattern schemas; React escapes rendered text | UI/public pages | No confirmed XSS sink |
| Search/filter/pagination | Bounded schemas and Drizzle query builders | SQL | No injection found; raw SQL is limited to trusted repository scripts/constants |
| Monitor HTTP URLs | URL parser, protocol checks, DNS/IP policy during execution, length 2,000 | DB, API, exports, worker | **Gap:** URL userinfo is accepted and retained (SEC-001) |
| TCP/Ping/Postgres targets | Host/IP/port/database schemas plus public-network enforcement | Worker sockets | Strong; private access restricted to explicitly configured admins |
| Redirects and DNS answers | Every destination re-resolved, prohibited IP classes rejected, lookup pinned | HTTP worker/browser | Strong SSRF control; unresolved create-time names are revalidated at execution |
| Templates and notification text | Zod lengths; rendered with escaping; no raw HTML sink found | Email/Telegram/webhook | Strong XSS baseline; outbound response sizes remain bounded |
| Channel credentials | Schema validation; AES-256-GCM at rest | SMTP, Telegram, webhook, DB | Encryption is strong; API re-disclosure exists for monitor tokens (SEC-002) |
| Backup file/options | Fixed formats/names, exclusive temp files, HMAC restore approval, validation | Filesystem / `pg_restore` | Strong; deployment ACL and legacy data require manual review |
| Proxy/IP headers | Trusted only when proxy mode explicitly configured | Rate-limit identity / URLs | Reasonable; deployment must ensure untrusted clients cannot reach an internal proxy hop directly |
| Host/Origin/Fetch metadata | JSON mutations require same-origin checks and appropriate Fetch metadata | API mutations | Good CSRF baseline; cookie transport configuration remains deployment-sensitive (SEC-006) |
| Remote response bodies | Timeouts and byte limits; screenshot concurrency cap | Logs/evidence/templates | Strong; expensive user-triggered operations still need quotas (SEC-005) |

## Confirmed findings

### SEC-001 — HTTP monitor URL credentials are stored and exported in plaintext

- **Severity:** High
- **Confidence:** High
- **OWASP:** A04:2025 Cryptographic Failures; API8:2023 Security Misconfiguration
- **CWE:** CWE-312 (Cleartext Storage of Sensitive Information), CWE-200 (Exposure of Sensitive Information)
- **Affected components:** HTTP monitor validation, monitor serialization, config export, workspace backup
- **Required access:** An authenticated user able to create/import a monitor; later disclosure to any role that can read that owner’s monitors or exports
- **Impact:** Basic-auth usernames/passwords embedded in a target URL can be exposed through the API, backups, config exports, database access, logs produced by downstream tooling, or support bundles.
- **Technical explanation:** `isHttpMonitorUrl` accepts an `http:`/`https:` URL but does not reject `URL.username` or `URL.password`. The full canonical URL is stored. The normal serializer removes/decrypts some secret columns but does not redact URL userinfo. The public display sanitizer does remove credentials, but it is not applied to owner API responses or exports.
- **Evidence:** `src/lib/monitors/schemas.ts:66-70,97`; `src/lib/monitors/utils.ts:18-34`; `src/app/api/monitors/route.ts:29,65`; `src/lib/monitors/targets.ts:197,249-260`; `src/lib/monitors/config-service.ts:23-32`; `src/lib/system/backup-service.ts:90`.
- **Safe reproduction:** In a local disposable workspace, submit `https://canary-user:canary-pass@example.com/health` as an HTTP monitor URL, then read the monitor and config export. The assessment observed both `acceptedUrl` and `exportedUrl` containing the canary credentials. No request was sent to a private or real target.
- **Existing mitigations:** Public status rendering strips username, password, query, and fragment. Workspace ownership prevents cross-user reads. Database and backup access are privileged.
- **Why insufficient:** The secret still exists in a general-purpose string and is returned through legitimate owner APIs. Encryption of other secret fields does not cover it.
- **Recommended fix:** Reject any HTTP URL with non-empty `username` or `password`; add a migration that redacts or blocks affected monitors and warns the owner. If Basic Auth is required, model username/password as dedicated encrypted fields, never return their plaintext, and apply credentials only to the exact validated origin.
- **Regression test:** Creation, update, config import, and restore must reject URL userinfo. Exports and backups must prove no known canary credential appears. Redirects must never forward separately stored credentials cross-origin.

### SEC-002 — Monitor APIs re-disclose decrypted heartbeat and Telegram tokens

- **Severity:** Medium
- **Confidence:** High
- **OWASP:** A01:2025 Broken Access Control; API3:2023 Broken Object Property Level Authorization
- **CWE:** CWE-200
- **Affected components:** Monitor serializer and monitor CRUD responses
- **Required access:** Any authenticated role with owner-workspace monitor read access
- **Impact:** A lower-privilege viewer can recover credentials that allow forged heartbeat events or direct use of a Telegram bot outside Sentrovia.
- **Technical explanation:** The serializer removes encrypted database-password storage but actively decrypts `telegramBotTokenEncrypted` and heartbeat token data into response fields. The same serializer is used by list/create routes.
- **Evidence:** `src/lib/monitors/utils.ts:18-34`; `src/app/api/monitors/route.ts:29,65`.
- **Safe reproduction:** Seed local canary Telegram/heartbeat tokens, call the owner monitor list as a viewer, and inspect the JSON. The review confirmed plaintext Telegram token output while database credentials were represented only by a configured state.
- **Existing mitigations:** Cross-user queries are owner-scoped; secrets are encrypted at rest.
- **Why insufficient:** At-rest encryption provides no protection after the API intentionally decrypts and returns the value to a broad read role.
- **Recommended fix:** Return only `telegramBotTokenConfigured` and `heartbeatTokenConfigured`. Reveal heartbeat tokens once at creation/rotation to an authorized mutation role; never echo Telegram bot tokens. Add an explicit rotate workflow.
- **Regression test:** Assert that list/get/create/update responses never contain encrypted column names or token canaries for viewer, operator, manager, or admin.

### SEC-003 — Logout clears the cookie but does not revoke the signed session

- **Severity:** Medium
- **Confidence:** High
- **OWASP:** A07:2025 Authentication Failures; API2:2023 Broken Authentication
- **CWE:** CWE-613
- **Affected components:** Logout route and JWT session model
- **Required access:** Possession of a copied session token
- **Impact:** A stolen token remains usable after the victim logs out, for up to the seven-day token lifetime, unless a password/role/session-version change or signing-key rotation occurs.
- **Technical explanation:** Logout writes an expired cookie only. Tokens contain a session version but no persisted per-session identifier/revocation record. Verification continues to accept a copied token whose version remains current.
- **Evidence:** `src/app/api/auth/logout/route.ts:9-15`; `src/lib/auth/token.ts:8,42-59,62-102,108-117`.
- **Safe reproduction:** Copy a local test account cookie, call logout with the browser cookie, then send the copied value in a separate client. The code path continues to validate it until expiry/version invalidation.
- **Existing mitigations:** HS256 algorithm/issuer/audience checks, seven-day expiry, HttpOnly/SameSite cookie, DB-backed session version invalidated on password and role changes.
- **Why insufficient:** Users reasonably expect logout to terminate that session, not just delete one browser copy.
- **Recommended fix:** Store a hashed `jti`/session record and revoke it on logout; provide “log out all sessions” through version rotation. A shorter access token plus rotated refresh-session record is another valid model.
- **Regression test:** A copied token must receive 401 immediately after logout while another explicitly retained session remains valid until “logout all”.

### SEC-004 — Onboarding defines but does not enforce its rate-limit rule

- **Severity:** Medium
- **Confidence:** High
- **OWASP:** A07:2025 Authentication Failures; API2:2023 Broken Authentication
- **CWE:** CWE-307
- **Affected components:** First-admin onboarding API
- **Required access:** Unauthenticated network access while onboarding is open
- **Impact:** An attacker can repeatedly submit expensive bcrypt onboarding requests, increasing resource pressure during the brief but security-critical initial setup window.
- **Technical explanation:** The rate-limit module includes an `onboarding` action with a five-attempt/30-minute rule, but the onboarding POST route never calls the check/failure/success functions. Login correctly does.
- **Evidence:** `src/lib/auth/rate-limit.ts:8,24,38,58,73`; `src/app/api/auth/onboarding/route.ts:25-45`; compare `src/app/api/auth/login/route.ts:14-40`.
- **Safe reproduction:** Static call-flow review is sufficient. Do not perform load testing. A route unit test can mock the limiter and proves there is currently no invocation.
- **Existing mitigations:** Onboarding closes after the first account; PostgreSQL advisory locking prevents duplicate initial admins; bcrypt concurrency is bounded globally.
- **Why insufficient:** Before the first successful setup, an unauthenticated caller can repeatedly consume the bounded expensive-work slots.
- **Recommended fix:** Apply the persistent onboarding limiter before bcrypt work, record failures, clear/record success, and return 429 with non-enumerating text.
- **Regression test:** The sixth failed attempt in the configured window returns 429 and does not call bcrypt or the create-user transaction.

### SEC-005 — Expensive authenticated and token endpoints lack business-flow quotas

- **Severity:** Medium
- **Confidence:** High
- **OWASP:** A06:2025 Insecure Design; API4:2023 Unrestricted Resource Consumption
- **CWE:** CWE-770
- **Affected components:** Monitor tests, delivery tests/retries, report sends, public heartbeat ingestion
- **Required access:** Operator session for outbound actions; heartbeat token for heartbeat ingestion
- **Impact:** A compromised or malicious permitted account can generate excessive browser/network/database/email/Telegram/webhook work, provider cost, log growth, and scheduler contention. A leaked heartbeat token can generate unbounded writes.
- **Technical explanation:** These routes validate payload size and ownership, and individual network operations have deadlines, but there is no persistent per-user/per-token request budget or daily send quota at the route/service layer.
- **Evidence:** `src/app/api/monitors/test/route.ts:20`; `src/app/api/delivery/test/route.ts:18-30`; `src/app/api/reports/send/route.ts:10`; `src/app/api/reports/[id]/send/route.ts:11-20`; `src/app/api/monitors/heartbeat/[token]/route.ts:22`; `src/lib/monitors/service.ts:943`.
- **Safe reproduction:** Static call-flow inspection; no volume test was performed. Unit-test a repeated-call policy after implementing the limit.
- **Existing mitigations:** Role checks, ownership, request body limits, target deadlines, response byte caps, screenshot concurrency cap, and a maximum monitor count.
- **Why insufficient:** Per-operation bounds limit one request, not aggregate resource use across repeated requests or distributed clients.
- **Recommended fix:** Add persistent per-user and per-token sliding-window limits, manual-send quotas, per-channel concurrency queues, and heartbeat event coalescing. Make thresholds configurable and observable.
- **Regression test:** Verify 429/queued behavior after threshold, separation by user/token, recovery after the window, and no duplicate provider call on rejected requests.

### SEC-006 — Production session-cookie transport security depends on `APP_URL`

- **Severity:** Medium
- **Confidence:** High
- **OWASP:** A02:2025 Security Misconfiguration; API8:2023 Security Misconfiguration
- **CWE:** CWE-614
- **Affected components:** Session cookie configuration and Docker defaults
- **Required access:** Network position capable of observing or altering an initial HTTP connection, or deployment misconfiguration
- **Impact:** If production is exposed over HTTP while `APP_URL` remains HTTP, the session cookie is not marked `Secure` and can traverse cleartext transport.
- **Technical explanation:** The cookie’s `secure` attribute is derived from the configured app URL. Docker Compose defaults `APP_URL` to `http://localhost:3000`, including production-mode containers. HSTS helps only after a browser receives it over a trusted HTTPS connection.
- **Evidence:** `src/lib/auth/token.ts:32-39,108-117`; `docker-compose.yml:62,107`.
- **Safe reproduction:** Start a local production-mode instance with an HTTP `APP_URL`, inspect the login `Set-Cookie`, and observe the absent `Secure` attribute. No interception is required.
- **Existing mitigations:** HttpOnly, SameSite=Strict, Path=/, priority, CSP/HSTS headers, and expected reverse-proxy TLS deployment.
- **Why insufficient:** A secure deployment property is optional and silently downgraded by a common default.
- **Recommended fix:** Fail production startup when the externally visible URL is non-HTTPS, except explicit loopback development. Document trusted proxy/TLS requirements and keep web ports private behind the proxy.
- **Regression test:** Production + public HTTP URL must fail validation; production + HTTPS must emit `Secure`; localhost development can remain intentionally non-Secure.

### SEC-007 — Windows services default to the highly privileged LocalSystem account

- **Severity:** Medium
- **Confidence:** High
- **OWASP:** A02:2025 Security Misconfiguration; API8:2023 Security Misconfiguration
- **CWE:** CWE-250
- **Affected components:** NSSM Windows installer, web/worker/browser processes
- **Required access:** Code execution in the Sentrovia web, worker, a native dependency, or browser process
- **Impact:** A process compromise can inherit extensive local-machine privilege instead of being contained to Sentrovia data and service operations.
- **Technical explanation:** The installer creates/configures NSSM services but does not set `ObjectName` or otherwise select a dedicated service account. Windows service creation with a null account defaults to LocalSystem.
- **Evidence:** `scripts/install-windows-nssm.ps1:442-472`; Microsoft `CreateService` and LocalSystem account documentation.
- **Safe reproduction:** On a disposable Windows host, install services and inspect `sc.exe qc SentroviaWeb` / `SentroviaWorker`; do not attempt privilege escalation.
- **Existing mitigations:** Fixed service commands/arguments, controlled working directory, environment generation, and application-level validation.
- **Why insufficient:** Application controls do not contain a native/browser/runtime compromise once host code execution exists.
- **Recommended fix:** Create a dedicated non-interactive least-privilege account or virtual service account, grant only required read/write/execute ACLs for application, logs, browser cache, and backup paths, and deny interactive/network logon where feasible.
- **Regression test:** Installer test asserts the configured account is not LocalSystem/Administrator and verifies startup with only documented ACLs.

### SEC-008 — Content Security Policy permits inline scripts and styles

- **Severity:** Low
- **Confidence:** High
- **OWASP:** A02:2025 Security Misconfiguration
- **CWE:** CWE-693
- **Affected components:** Global response headers
- **Required access:** A separate HTML/script injection primitive, which this assessment did not find
- **Impact:** If a future injection bug is introduced, `unsafe-inline` weakens CSP’s ability to prevent script execution and makes the policy less effective as defense in depth.
- **Technical explanation:** The configured policy includes `script-src 'self' 'unsafe-inline'` and `style-src 'self' 'unsafe-inline'`. No current raw HTML/eval sink was found, so this is not rated as an exploitable XSS by itself.
- **Evidence:** `next.config.ts:11-12,21-26`.
- **Safe reproduction:** Inspect the `Content-Security-Policy` response header on a local page.
- **Existing mitigations:** React escaping, no raw HTML APIs, no eval, frame denial, MIME sniffing protection, and a restrictive source list.
- **Why insufficient:** A CSP containing inline script allowance cannot reliably block many inline injection payloads.
- **Recommended fix:** Roll out a nonce/hash-based strict CSP, first in report-only mode, following the current Next.js nonce guidance. Remove `unsafe-inline` for scripts once compatibility is verified.
- **Regression test:** Header test forbids script `unsafe-inline`; a canary inline script without the correct nonce must not execute.

### SEC-009 — Security audit coverage omits several high-value actions

- **Severity:** Low
- **Confidence:** High
- **OWASP:** A09:2025 Security Logging and Alerting Failures; API10:2023 Unsafe Consumption of APIs (operational detection aspect)
- **CWE:** CWE-778
- **Affected components:** Onboarding, password change, backup export/restore, recovery operations
- **Required access:** Legitimate or compromised account performing sensitive actions
- **Impact:** Incident investigators may be unable to establish who initialized the system, changed credentials, exported/restored data, or invoked recovery. Detection rules cannot reliably alert on those events.
- **Technical explanation:** Login and several member/monitor/settings actions emit audit records, but the reviewed high-value routes do not consistently call the audit service. Safe audit recording also intentionally allows business actions to continue if logging fails.
- **Evidence:** Audit calls in `src/app/api/auth/login/route.ts:9,30,37`; absence in `src/app/api/auth/onboarding/route.ts`, `src/app/api/auth/change-password/route.ts:14-55`, `src/app/api/system/backup/export/route.ts:12-32`, and `src/app/api/system/backup/restore/route.ts:20-70`.
- **Safe reproduction:** Execute these actions in a local workspace and query audit events; compare with login/member operations.
- **Existing mitigations:** Operational logs exist; audit failures are written to server logs rather than silently swallowed.
- **Why insufficient:** Server console logs are not a complete, queryable, actor-attributed security trail.
- **Recommended fix:** Add redacted success/failure audit events for initialization, password/session changes, backup preview/export/restore, recovery, role changes, and update checks. Alert on repeated auth failures, recovery, and restore.
- **Regression test:** Each sensitive action produces exactly one actor/time/result/resource event without passwords, tokens, backup contents, or URLs containing credentials.

### SEC-010 — Update instructions do not verify the published artifact checksum/attestation

- **Severity:** Low
- **Confidence:** High
- **OWASP:** A03:2025 Software Supply Chain Failures; A08:2025 Software or Data Integrity Failures
- **CWE:** CWE-494
- **Affected components:** In-app update assistant and operator update process
- **Required access:** Compromise of release metadata/tag resolution, maintainer account, or the operator’s Git transport path
- **Impact:** An operator following the displayed commands trusts the fetched tag and source checkout without independently checking the release archive’s SHA-256 or attestation.
- **Technical explanation:** The application queries a fixed GitHub API and shows manual `git fetch`/`git checkout <tag>` instructions. The release workflow already creates checksums and attestations, but the consumer path does not validate them.
- **Evidence:** `src/lib/updates/service.ts:134-153,223-251`; `.github/workflows/publish-image.yml:30-50,59-64`.
- **Safe reproduction:** Review the generated update command list; it contains no checksum or attestation verification step.
- **Existing mitigations:** Fixed repository endpoint, SemVer tag validation, manual operator approval, immutable-release guard, pinned GitHub Actions, checksums, and attestations.
- **Why insufficient:** Producer-side integrity metadata provides no protection if the consumer never checks it.
- **Recommended fix:** Download the exact release archive, verify its published SHA-256 and GitHub artifact attestation, then install from the verified staging directory. Alternatively require cryptographically signed immutable tags and verify signatures.
- **Regression test:** Tampered archive/checksum/tag-signature fixtures must abort before services stop or files change.

### SEC-011 — Public status pages can disclose private infrastructure naming

- **Severity:** Low
- **Confidence:** High
- **OWASP:** A01:2025 Broken Access Control; API3:2023 Broken Object Property Level Authorization
- **CWE:** CWE-200
- **Affected components:** Public status publication and URL display sanitizer
- **Required access:** Admin/operator intentionally publishing a monitor; public visitor to the page
- **Impact:** Internal hostnames, literal private IPs, ports, or sensitive path naming can be exposed to unauthenticated visitors.
- **Technical explanation:** Only active monitors explicitly marked for status publication are selected, and credentials/query/fragment are stripped. The remaining sanitized URL preserves hostname, port, and path, including for an admin-created private target.
- **Evidence:** `src/lib/public-status/service.ts:36-68,116-124,201-202`; `src/lib/monitors/targets.ts:249-260`.
- **Safe reproduction:** In a local workspace, create an admin-authorized private monitor with a canary internal hostname/path, explicitly publish it, and view the local public status page.
- **Existing mitigations:** Publication is opt-in; rows are owner/page/company scoped; username, password, query, and fragment are removed.
- **Why insufficient:** Explicit publication may be accidental, and hostname/path metadata can still be sensitive.
- **Recommended fix:** Add a separate public display label, show a warning/confirmation for private targets, default display to the monitor name, and optionally prohibit private URL publication by policy.
- **Regression test:** Public JSON/HTML must not contain a private target string unless a dedicated explicit disclosure setting is enabled.

### SEC-012 — Application runtime uses the PostgreSQL superuser by default

- **Severity:** Low
- **Confidence:** High
- **OWASP:** A02:2025 Security Misconfiguration
- **CWE:** CWE-250
- **Affected components:** Docker Compose database, web, and worker configuration
- **Required access:** SQL execution through a future application/database-client compromise
- **Impact:** A compromised web or worker database connection receives cluster-level authority beyond Sentrovia’s runtime needs, increasing blast radius.
- **Technical explanation:** The database defaults to `POSTGRES_USER=postgres`; web and worker use that same credential. Database exposure is loopback-only, but application processes legitimately possess the superuser credential.
- **Evidence:** `docker-compose.yml:36,39-40,59,104`.
- **Safe reproduction:** Inspect the effective Compose environment and query `current_user`/`rolsuper` in a disposable stack.
- **Existing mitigations:** Database port binds to loopback; credentials are environment-supplied; application queries are parameterized.
- **Why insufficient:** Network restriction and injection prevention do not enforce least privilege after an application process or credential is compromised.
- **Recommended fix:** Use a migration owner role, a non-superuser runtime role limited to the Sentrovia schema/tables/sequences, and a narrowly scoped backup/restore role invoked only when needed.
- **Regression test:** Runtime CRUD and migrations succeed with separate roles; runtime role cannot create roles/databases, access unrelated schemas, or alter protected ownership.

## Authorization matrix

| Capability | Public | Viewer | Operator | Manager | Admin |
| --- | :---: | :---: | :---: | :---: | :---: |
| Login/onboarding/health | Limited | — | — | — | — |
| Public heartbeat/status | Token / published | — | — | — | — |
| Read own monitors, companies, reports, delivery, settings | No | Yes | Yes | Yes | Yes |
| Change own password/profile/dashboard/log presets | No | Yes | Yes | Yes | Yes |
| Manage monitors/companies/delivery/reports/settings/status pages | No | No | Yes | Yes | Yes |
| Read/manage members | No | No | No | Constrained lower roles | Yes |
| Read/clear audit logs | No | Read only | Read only | Yes | Yes |
| Worker/system/update administration | No | No | No | No | Yes |
| Backup export/restore | No | No | No | No | Yes |
| Create private-network targets | No | No | No | No | Yes, only when environment policy enables it |

### Authorization conclusions

- The proxy denies disallowed mutation groups before route execution.
- Service queries combine actor `userId` with object IDs; no cross-user IDOR was confirmed.
- Managers can assign/manage only operator/viewer accounts and cannot manage peer managers/admins.
- Last-admin and first-admin races use PostgreSQL advisory locking/transactions.
- Password, role, and account changes invalidate session versions. Logout is the exception described in SEC-003.
- Viewer secret re-disclosure is a property-level authorization issue, not a row-level IDOR (SEC-002).

## SSRF and outbound request assessment

SSRF was treated as a critical design area because monitor targets, redirects, screenshots, webhooks, SMTP, PostgreSQL checks, and notification providers all cross network trust boundaries.

### Controls confirmed

- Hostnames are normalized; localhost/internal suffixes, loopback, private, link-local, multicast, reserved, and IPv4-mapped IPv6 destinations are classified.
- Every resolved answer must be allowed; one safe answer does not hide a prohibited answer.
- DNS resolution is pinned into the outbound connection to reduce rebinding windows.
- HTTP redirect destinations are resolved and revalidated before following, with a bounded redirect count and overall deadline.
- HTTP response bodies are capped after decompression.
- TCP, ping, and PostgreSQL checks apply destination policy and validated ports/addresses.
- PostgreSQL TLS supports certificate/hostname verification.
- Screenshots use a fresh browser context, pinned navigation, same-origin resource restrictions, same-host redirects, no `file:` URLs, timeout/byte/concurrency bounds, and do not disable Chromium’s sandbox in code.
- Webhooks allow public destinations only, reject inline credentials, disable redirects, pin DNS, and cap response bodies.
- SMTP resolves/pins public destinations.
- Telegram uses a fixed provider hostname; update metadata uses a fixed GitHub endpoint.
- Admin private-target mode still blocks loopback, local, link-local, and multicast targets and requires environment enablement.

### Residual SSRF risks

- Admin-enabled private targets intentionally grant network reachability; treat admin compromise as a network-pivot risk and segment the worker.
- Browser and OS sandbox effectiveness depends on the deployment kernel/account. Windows LocalSystem materially increases impact (SEC-007).
- Monitor URL userinfo is a secret-management flaw, not an SSRF bypass (SEC-001).
- Reverse-proxy egress policy is not represented in code. Production should enforce network-layer deny rules as a second boundary.

No general SSRF bypass to cloud metadata, loopback, RFC1918/ULA, or arbitrary redirect destinations was confirmed.

## Authentication and session assessment

- JOSE verification pins HS256 and validates issuer, audience, subject, expiry, and the database-backed session version.
- Passwords require 12–128 characters with upper/lower/number/special classes and use bcrypt cost 12.
- Unknown-user login performs a dummy password hash comparison to reduce timing enumeration.
- Persistent login limits and bounded bcrypt concurrency are present.
- Initial admin creation is transactionally locked and closes once any user exists.
- Role and password changes increment session version; deleted accounts fail DB-backed validation.
- Cookies are HttpOnly and SameSite Strict. Transport security is conditional (SEC-006).
- Logout is not token revocation (SEC-003).
- Onboarding’s intended limiter is not called (SEC-004).

## XSS, CSRF, injection, and error handling

- No raw HTML insertion, eval-family execution, or user-authored React HTML sink was found.
- Templates/previews rely on escaped text and server-side formatting.
- Mutation requests require JSON and same-origin/Fetch-metadata checks; SameSite Strict provides an additional CSRF barrier.
- Drizzle parameterization is used for request-derived SQL. `sql.unsafe` occurrences are limited to trusted repository migrations/maintenance paths or constant identifiers.
- Process execution uses fixed validated arguments with `spawn`/`execFile` and `shell: false`; no user-controlled shell command was confirmed.
- Backup filenames/formats are allow-listed and temporary files use exclusive creation/UUID naming; no path traversal was confirmed.
- API failures return controlled messages; no stack trace was observed in HTTP responses.
- CSP defense in depth can be improved (SEC-008).

## Secrets, encryption, and backup assessment

- Application encryption and authentication secrets are separate.
- Stored channel/database secrets use AES-256-GCM with random IVs and authentication tags.
- Backup encryption uses AES-GCM with domain-separated key derivation.
- Heartbeat tokens are stored as HMAC-derived values for lookup/verification.
- Database backups validate filenames/formats, create exclusive temporary files, verify encrypted content/`pg_restore`, and implement retention.
- Restore uses an admin-only preview plus a ten-minute HMAC approval bound to actor, format, content, and workspace revision, then a serializable operation.
- Workspace backup intentionally omits configured secret columns, but HTTP URL userinfo bypasses that model (SEC-001).
- Decrypted token API output weakens at-rest protection (SEC-002).
- Tracked source/history secret scans were clean; deployment `.env.local` ACLs and legacy plaintext rows still require manual verification.

## Supply-chain and update assessment

- Lockfile integrity data is present; the assessment-time dependency audit reported zero known advisories.
- GitHub Actions are pinned to full commit SHAs.
- Release publishing checks immutability, creates archives/checksums, and emits provenance/attestation.
- Container image references are digest-pinned and an SBOM/provenance path exists.
- The update assistant is non-automatic and uses a fixed GitHub API endpoint, reducing arbitrary update URL risk.
- The operator path does not consume the existing integrity metadata (SEC-010).

References: [OWASP Top 10:2025](https://owasp.org/Top10/2025/0x00_2025-Introduction/), [OWASP API Security Top 10:2023](https://owasp.org/API-Security/editions/2023/en/0x03-introduction/), [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use).

## Deployment and reverse-proxy assessment

- Docker database exposure is loopback-only; web intentionally binds on all interfaces; worker has no public listener.
- Containers run as the image’s non-root `node` user.
- Web and worker share a PostgreSQL superuser by default (SEC-012).
- Production TLS and correct `APP_URL` are external assumptions; misconfiguration affects cookie security (SEC-006).
- Trusted forwarded-client headers must be enabled only behind a controlled proxy and direct backend access should be blocked.
- Windows NSSM services require a dedicated identity and ACL design (SEC-007).
- Add an explicit production Host allow-list at the edge and verify request-size/time limits in the reverse proxy.

## Security headers

Observed/configured controls include:

- `Content-Security-Policy`
- `Strict-Transport-Security`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- restrictive `Permissions-Policy`
- `Referrer-Policy`
- `Cache-Control: no-store` on health/sensitive paths where reviewed

The primary header weakness is CSP inline allowance (SEC-008). HSTS cannot repair an initial cleartext deployment and therefore does not remove SEC-006.

## OWASP Top 10:2025 coverage

| Category | Result |
| --- | --- |
| A01 Broken Access Control | Strong row/role controls; SEC-002 property disclosure and SEC-011 public metadata |
| A02 Security Misconfiguration | SEC-006 cookie transport, SEC-007 service identity, SEC-008 CSP, SEC-012 DB role |
| A03 Software Supply Chain Failures | Pinned actions/digests and clean audit; SEC-010 consumer verification gap |
| A04 Cryptographic Failures | Strong AES-GCM/JWT baseline; SEC-001 plaintext URL credentials |
| A05 Injection | No confirmed SQL, OS command, template, or browser-script injection |
| A06 Insecure Design | SEC-005 aggregate resource limits |
| A07 Authentication Failures | SEC-003 logout revocation; SEC-004 onboarding limiting |
| A08 Software or Data Integrity Failures | Restore approval strong; SEC-010 update verification gap |
| A09 Security Logging and Alerting Failures | SEC-009 incomplete high-value audit events |
| A10 Mishandling of Exceptional Conditions | Bounded errors/timeouts and rollback paths reviewed; no confirmed exploit |

## OWASP API Security Top 10:2023 coverage

| Category | Result |
| --- | --- |
| API1 Broken Object Level Authorization | No cross-user IDOR confirmed; queries are owner-scoped |
| API2 Broken Authentication | SEC-003 and SEC-004 |
| API3 Broken Object Property Level Authorization | SEC-002; SEC-011 public field disclosure |
| API4 Unrestricted Resource Consumption | SEC-005 |
| API5 Broken Function Level Authorization | Role/mutation matrix enforced; no bypass confirmed |
| API6 Unrestricted Access to Sensitive Business Flows | SEC-005 manual sends/tests |
| API7 Server Side Request Forgery | Extensive controls; no general bypass confirmed |
| API8 Security Misconfiguration | SEC-006, SEC-007, SEC-008, SEC-012 |
| API9 Improper Inventory Management | Route inventory documented above; no forgotten versioned API found |
| API10 Unsafe Consumption of APIs | Remote data is bounded/validated; operational logging remains incomplete |

## Application-specific security questions

| # | Question | Conclusion |
| ---: | --- | --- |
| 1 | Can a viewer elevate privileges? | No confirmed path; mutation permissions and member-role checks are server-side. |
| 2 | Can an operator reach admin/manager functions? | No confirmed path. |
| 3 | Can a manager access backups or private targets? | No; those permissions are admin-only. |
| 4 | Can IDs be changed to access another workspace? | No confirmed IDOR; service queries combine object ID and actor `userId`. |
| 5 | Can unauthenticated callers reach protected APIs? | Protected routes redirect/deny; only enumerated public APIs remain open. |
| 6 | Does onboarding remain open after setup? | No; it closes when any account exists. |
| 7 | Can concurrent onboarding create multiple admins? | Advisory lock/transaction prevents it. |
| 8 | Are old sessions invalidated? | Password/role/delete: yes. Logout: no, SEC-003. |
| 9 | Can a non-admin use monitor checks to reach private networks? | No confirmed path; admin private mode is explicit and environment-gated. |
| 10 | Are HTTP redirects revalidated? | Yes, at every hop. |
| 11 | Is DNS pinned/rebinding-resistant? | Yes, resolved destinations are policy-checked and pinned. |
| 12 | Are IPv6 and mapped IPv4 forms handled? | Yes, including prohibited ranges. |
| 13 | Can TCP checks bypass private-target policy? | No confirmed bypass. |
| 14 | Can PostgreSQL checks bypass private-target policy? | No confirmed bypass. |
| 15 | Can screenshot resources pivot to another origin? | Same-origin/pinned restrictions are present. |
| 16 | Can webhooks redirect or target private hosts? | Redirects disabled; public-only pinned destination policy. |
| 17 | Can users inject arbitrary HTTP auth headers/bodies? | No general custom-header/body feature; URL userinfo creates SEC-001. |
| 18 | Can credentials leak across redirects? | No configurable auth headers; separately stored credentials must remain origin-scoped in any future implementation. |
| 19 | Is user content rendered as executable HTML/script? | No confirmed sink. |
| 20 | Can hostile remote response content become UI XSS? | No confirmed path; content is bounded and escaped. |
| 21 | Are channel/database credentials encrypted? | Yes, but HTTP URL credentials are not (SEC-001). |
| 22 | Are encrypted secrets hidden from read APIs? | Database password is represented safely; Telegram/heartbeat are not, SEC-002. |
| 23 | Are backups restricted? | Yes, admin-only. |
| 24 | Can backup paths traverse the filesystem? | No confirmed traversal; filenames/formats/temp paths are constrained. |
| 25 | Can public status expose private targets? | Only after explicit publication, but metadata remains visible, SEC-011. |
| 26 | Are unknown/mass-assignment fields accepted? | Zod strips unknown keys and services map explicit properties. |
| 27 | Can request input reach raw SQL? | No confirmed path; request-derived queries are parameterized. |
| 28 | Is `Host`/forwarded metadata trusted unsafely? | Application links use configured URL; forwarded identity trust is opt-in. Edge configuration requires manual validation. |
| 29 | Are cookie mutations CSRF-resistant? | SameSite Strict plus JSON/origin/fetch checks provide a good baseline. |
| 30 | Are authentication and expensive endpoints adequately throttled? | Login is; onboarding and several business flows are not, SEC-004/005. |
| 31 | Can logs disclose secrets? | No general confirmed log leak; URL userinfo remains a broad disclosure risk, SEC-001. |
| 32 | Do errors expose stack traces? | No stack response observed. |
| 33 | Do deployments invalidate sessions? | Installer/session configuration can rotate; ordinary deployments retain seven-day sessions by design. |
| 34 | Are updates verified end to end? | Producer emits integrity data; consumer does not verify it, SEC-010. |
| 35 | Can user input become a shell command? | No confirmed path; fixed args and `shell: false` are used. |
| 36 | Are runtime services minimally exposed? | Worker is internal and DB loopback-only; web is intentionally public. Windows identity is overprivileged, SEC-007. |
| 37 | Is PostgreSQL Internet-exposed by default? | No, it binds to loopback, but runtime uses superuser, SEC-012. |
| 38 | Are security headers complete? | Good baseline; CSP and transport assumptions need improvement, SEC-006/008. |
| 39 | Does CSP materially constrain XSS? | Partly; inline script allowance weakens it, SEC-008. |
| 40 | Can individual findings be chained? | Yes; plausible chains are described below, but no confirmed Critical chain was found. |

## Plausible attack chains

1. **URL credential disclosure:** operator stores a Basic-Auth URL → viewer/backup/export receives full URL → credential is reused against the monitored service. This is the most practical confirmed chain and drives SEC-001 High.
2. **Transport/session persistence:** public deployment uses HTTP `APP_URL` → cookie crosses cleartext network → attacker copies JWT → victim logs out → copied token remains valid due SEC-003.
3. **Browser-to-host blast radius:** hostile public page exploits a future Chromium/runtime vulnerability → screenshot worker code execution → Windows NSSM LocalSystem identity expands compromise. No browser exploit was demonstrated; SEC-007 raises impact.
4. **Token abuse/resource pressure:** monitor API re-discloses heartbeat or Telegram token → attacker forges heartbeat writes or directly uses bot credentials → absent aggregate quotas prolong abuse. This combines SEC-002 and SEC-005.

No demonstrated chain reached unauthenticated administrator takeover, cross-user database access, or cloud metadata through SSRF.

## Positive security controls

- Server-side role permissions and owner-scoped database queries.
- Constrained manager role assignment and last-admin protections.
- Race-safe first-admin initialization.
- Strong password policy, bcrypt cost, dummy hash, persistent login limits, bounded bcrypt concurrency.
- Pinned JWT algorithm/claims plus DB-backed session version.
- JSON content-type, body limits, same-origin, and Fetch Metadata validation.
- Zod schemas and explicit object mappings.
- Parameterized SQL and fixed non-shell process execution.
- Comprehensive public-network target policy with DNS pinning and redirect revalidation.
- HTTP deadline, redirect, decompressed-body, screenshot-size, and concurrency limits.
- Browser sandbox retained; fresh contexts and same-origin resource policy.
- AES-256-GCM secret encryption and authenticated/domain-separated backup encryption.
- Restore approval bound to actor/content/workspace revision and short expiry.
- Public status publication opt-in and credential/query redaction.
- Metrics fail closed unless a strong token is configured.
- Non-root Docker application user, loopback DB binding, worker without public port.
- Full-SHA GitHub Actions, digest-pinned images, release checksum/attestation.
- Clean assessment-time dependency and repository secret scans.

## Prioritized remediation plan

### P0 — before production exposure

1. Fix SEC-001: reject URL userinfo, migrate existing values, add export/backup leak tests.
2. Fix SEC-002: replace plaintext token fields with configured flags and rotation workflows.
3. Fix SEC-006: enforce HTTPS-safe production startup and cookie tests.
4. Fix SEC-007: deploy Windows services under a dedicated low-privilege identity.

### P1 — first security hardening release

1. Fix SEC-003 with revocable per-session records and logout-all support.
2. Fix SEC-004/005 with persistent limits, queues, and observability.
3. Fix SEC-009 with actor-attributed, redacted audit events and alerts.
4. Split migration, runtime, and backup PostgreSQL roles (SEC-012).

### P2 — defense in depth

1. Roll out nonce/hash CSP and remove script `unsafe-inline` (SEC-008).
2. Verify release artifact checksums/attestations in the update procedure (SEC-010).
3. Add private-target publication warnings and public display aliases (SEC-011).
4. Add edge Host allow-list, egress controls, and deployment conformance checks.

## Required regression test additions

1. Reject HTTP URL username/password on create, update, import, restore, and backup import.
2. Scan monitor JSON, config exports, workspace backups, and logs for secret canaries.
3. Assert every role receives only configured flags for monitor/channel secrets.
4. Prove a copied JWT fails immediately after logout/revocation.
5. Prove onboarding and expensive business flows return 429/queue after configured limits without invoking expensive work.
6. Validate `Secure` cookies and production HTTPS configuration matrix.
7. Verify NSSM service account and filesystem ACLs on a disposable Windows runner.
8. Validate runtime PostgreSQL role cannot perform cluster administration.
9. Assert CSP excludes script `unsafe-inline` and blocks a nonce-less canary.
10. Assert sensitive actions emit one redacted audit record on success/failure.
11. Verify update installation aborts on tampered artifact/checksum/attestation.
12. Verify private target strings do not appear publicly without an explicit disclosure setting.
13. Keep SSRF coverage for mixed DNS answers, IPv4-mapped IPv6, redirects, rebinding, credentialed URLs, decompression limits, screenshot subresources, TCP, and PostgreSQL.

## Unverified or deployment-dependent items

1. Effective reverse-proxy TLS redirect, Host allow-list, request limits, and forwarded-header trust.
2. Production firewall/egress rules that independently block cloud metadata and internal management networks.
3. Windows `.env.local`, log, browser-cache, and backup directory ACLs on the real host.
4. Effective Chromium sandboxing under the target Windows/Linux service identity.
5. GitHub repository tag protection, release immutability settings, and maintainer MFA.
6. Existing production rows for legacy plaintext credentials or URL userinfo.
7. Backup storage encryption, retention, off-host access controls, and recovery-key custody outside this repository.

These are not counted as vulnerabilities without deployment evidence. They should be verified through a production-readiness checklist before launch.

## Final assessment

Sentrovia’s central authorization, SSRF, cryptography, restore-integrity, and CI controls are thoughtfully implemented and tested. The product is not ready for broad production exposure until the High finding and the secret/session/deployment Medium findings are resolved. The remaining Low findings are primarily least-privilege, defense-in-depth, and operational-detection improvements rather than currently demonstrated remote compromises.
