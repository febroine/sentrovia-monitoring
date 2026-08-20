# Contributing to Sentrovia

Sentrovia welcomes focused bug fixes, documentation improvements, tests, and changes that strengthen reliable internal monitoring. Open an issue before starting a large feature or architectural change so the scope can be agreed on first.

## Development setup

Requirements:

- Node.js 20.9 or newer;
- npm;
- PostgreSQL 16 for database-backed development;
- Playwright Chromium when testing screenshot capture.

Install dependencies and run the application:

```bash
npm ci
npm run db:sync
npm run dev
```

Use a private local environment file based on `.env.example`. Never commit real credentials, monitored internal URLs, database dumps, screenshots containing customer data, or exported workspace bundles.

## Before opening a pull request

Run the same checks used by CI:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Keep pull requests narrow and explain:

- the problem being solved;
- the behavior before and after the change;
- tests added or updated;
- database, migration, worker, notification, or deployment impact;
- screenshots for visible interface changes, using synthetic data only.

Preserve existing routes, APIs, configuration compatibility, and upgrade behavior unless the change explicitly documents a breaking migration.

## Reporting bugs

Use the bug report form and provide a minimal reproduction. Redact secrets, session cookies, authorization headers, webhook URLs, SMTP credentials, private hostnames, and customer data from logs and screenshots.

Security vulnerabilities must follow [SECURITY.md](SECURITY.md) and must not be reported publicly.

## Conduct

Be respectful, specific, and constructive. Harassment, personal attacks, discriminatory language, and disclosure of another person's private information are not accepted in project spaces.
