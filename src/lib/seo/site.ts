import type { Metadata } from "next";
import { env } from "@/lib/env";

export const SITE_NAME = "Sentrovia";
export const SITE_TITLE = "Sentrovia: self-hosted uptime monitoring";
export const SITE_DESCRIPTION =
  "Open-source, self-hosted uptime monitoring for websites, APIs, TCP ports, PostgreSQL, and cron jobs, with verified outage alerts, failure evidence, and public status pages.";
export const REPOSITORY_URL = "https://github.com/febroine/sentrovia-monitoring";
export const SOCIAL_IMAGE = { url: "/sentrovia-digital-observatory-hd.webp", alt: "Sentrovia uptime monitoring" };

// Pages anyone, including crawlers, can read without signing in.
export const PUBLIC_PAGES = [
  {
    path: "/about",
    title: "About Sentrovia",
    description: "What Sentrovia monitors, how it verifies an outage before alerting, and how the web app and worker fit together.",
  },
  {
    path: "/help",
    title: "Sentrovia help",
    description: "Install Sentrovia, add a first monitor, set up notifications, and get to a verified check.",
  },
] as const;

// Signed-in application areas. Crawlers would only be redirected to the sign-in page.
// /login and /onboarding stay crawlable so crawlers can read their noindex tag.
export const PRIVATE_PATHS = [
  "/api/",
  "/companies",
  "/dashboard",
  "/delivery",
  "/logs",
  "/members",
  "/monitoring",
  "/profile",
  "/reports",
  "/settings",
] as const;

/** Public origin of this installation, read from APP_URL at request time. */
export function getSiteUrl() {
  try {
    return new URL(env.appUrl).origin;
  } catch {
    return "http://localhost:3000";
  }
}

export function absoluteUrl(path: string) {
  return new URL(path, getSiteUrl()).toString();
}

/** Metadata for a public page. Page-level openGraph replaces the layout's, so the shared fields are repeated here. */
export function publicPageMetadata(page: (typeof PUBLIC_PAGES)[number]): Metadata {
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical: page.path },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      title: page.title,
      description: page.description,
      url: page.path,
      images: [SOCIAL_IMAGE],
    },
  };
}
