# Security Policy

Sentrovia stores operationally sensitive data such as monitored URLs, notification destinations, SMTP credentials, webhook secrets, and internal service metadata. Please report suspected vulnerabilities privately.

## Supported versions

Security fixes are provided for the latest published release. Upgrade to the newest release before reporting behavior that may already have been corrected.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/febroine/sentrovia-monitoring/security/advisories/new) when possible. Do not open a public issue for a vulnerability that could expose credentials, bypass authentication, reach private network targets, disclose monitor data, or compromise a Sentrovia installation.

Include only the information needed to reproduce and assess the issue:

- affected Sentrovia version and deployment method;
- impact and expected security boundary;
- minimal reproduction steps or proof of concept;
- relevant logs with secrets, cookies, tokens, addresses, and customer data removed;
- whether the issue is already being exploited or publicly discussed.

The maintainers aim to acknowledge a complete report within five business days. Validation, remediation, and disclosure timing depend on severity and the complexity of a safe fix. Please allow time for a patched release before publishing technical details.

## Deployment responsibility

- Keep `.env`, `.env.local`, database backups, and exported workspace bundles private.
- Use strong, independent values for `AUTH_SECRET`, `APP_ENCRYPTION_SECRET`, and database credentials.
- Restrict PostgreSQL and Sentrovia administration routes to trusted networks.
- Set `MONITOR_ALLOW_PRIVATE_TARGETS=false` when the installation must not reach private or loopback targets.
- Terminate HTTPS at a trusted reverse proxy and configure proxy-header trust deliberately.
- Rotate exposed credentials immediately; deleting a value from Git history does not revoke it.

General support questions and non-sensitive bugs belong in the public issue tracker.
