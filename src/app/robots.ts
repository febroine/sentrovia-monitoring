import type { MetadataRoute } from "next";
import { PRIVATE_PATHS, absoluteUrl } from "@/lib/seo/site";

// APP_URL is set per installation at runtime, not when the image is built.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...PRIVATE_PATHS],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
