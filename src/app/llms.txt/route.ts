import { PUBLIC_PAGES, REPOSITORY_URL, SITE_DESCRIPTION, SITE_NAME, absoluteUrl } from "@/lib/seo/site";

// APP_URL is set per installation at runtime, not when the image is built.
export const dynamic = "force-dynamic";

// Format: https://llmstxt.org/ (H1 name, blockquote summary, then H2 sections of links).
export function GET() {
  const pageLinks = PUBLIC_PAGES
    .map((page) => `- [${page.title}](${absoluteUrl(page.path)}): ${page.description}`)
    .join("\n");

  const body = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

Sentrovia runs on your own server with Docker Compose or as a Windows service and keeps check history in your own PostgreSQL database. A failed check is retried and the monitoring host's own connectivity is tested before a down alert is sent. Email, Telegram, Discord, and webhook deliveries are recorded.

## Docs

${pageLinks}
- [README](${REPOSITORY_URL}/blob/main/README.md): Features, supported check types, Docker quick start, and FAQ.
- [Deployment guide](${REPOSITORY_URL}/blob/main/docs/deployment.md): Production installation, upgrades, and backups.

## Optional

- [Source code](${REPOSITORY_URL}): MIT-licensed repository with issues and releases.
- [Changelog](${REPOSITORY_URL}/blob/main/CHANGELOG.md): Release history.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
