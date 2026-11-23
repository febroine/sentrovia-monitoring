import type { MetadataRoute } from "next";
import { PUBLIC_PAGES, absoluteUrl } from "@/lib/seo/site";

// APP_URL is set per installation at runtime, not when the image is built.
export const dynamic = "force-dynamic";

// Public status pages are left out on purpose: their slugs are shared by link, and listing them here would publish every one.
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((page) => ({
    url: absoluteUrl(page.path),
    changeFrequency: "monthly",
    priority: page.path === "/about" ? 1 : 0.8,
  }));
}
