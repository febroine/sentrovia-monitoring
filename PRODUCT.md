# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are small teams and operators who run websites, APIs, servers, databases, and scheduled jobs and need to understand whether a failure is real before paging the team. This is inferred from the repository overview and supported monitor types.

## Product Purpose

Sentrovia is an open-source, self-hosted uptime monitoring workspace. It verifies failed checks, records evidence, and routes alerts so teams can respond to trustworthy outage information from infrastructure they control.

## Positioning

Sentrovia verifies an outage before treating a failed request as an alert, including monitoring-server connectivity checks and a final confirmation probe. This verification-first mechanism is the product's differentiating truth.

## Operating Context

Teams operate Sentrovia as a Docker Compose stack or on Windows services. The workspace covers monitor inventory, outage evidence, status pages, reports, notification delivery, and role-based access.

## Capabilities and Constraints

- Supported checks include HTTP/HTTPS, API/JSON, keyword, TCP port, ICMP ping, PostgreSQL, and heartbeat/cron.
- Confirmed product workflows include verified outage alerts, screenshot evidence when available, public status pages, auditable delivery history, reports, and workspace isolation.
- The onboarding flow creates the first administrator and signs that user in automatically.
- The product does not claim to replace CPU, memory, disk, or network-traffic observability.
- Existing behavior, API contracts, semantic form controls, and Docker-based local operation must remain intact during UI work.

## Brand Commitments

The product name is Sentrovia. Existing repository and user direction establish a technical, trustworthy, evidence-first character. The existing Sentrovia mark and IBM Plex Sans / IBM Plex Mono font setup are confirmed project assets and should remain available to the interface.

## Evidence on Hand

Repository product copy in `README.md`, executable theme/font tokens in `src/app/globals.css` and `src/app/layout.tsx`, the existing Sentrovia mark, and the current application routes. Product screenshots and example data in `docs/screenshots/` are illustrative and must not be presented as live customer evidence.

## Product Principles

- Verify before escalating.
- Make evidence inspectable.
- Keep delivery outcomes auditable.
- Keep operational data under the team's control.
- Prefer clear recovery paths over ambiguous states.

## Accessibility & Inclusion

Onboarding must preserve labelled form fields, keyboard navigation and focus visibility, readable contrast, inline validation feedback, accessible names for icon controls, reduced-motion behavior, and responsive layouts without horizontal overflow.
