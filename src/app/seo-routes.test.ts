import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

async function loadRoutes(appUrl: string) {
  vi.resetModules();
  vi.stubEnv("APP_URL", appUrl);
  const [robots, sitemap, llms] = await Promise.all([
    import("./robots"),
    import("./sitemap"),
    import("./llms.txt/route"),
  ]);
  return { robots: robots.default, sitemap: sitemap.default, llms: llms.GET };
}

describe("search and crawler routes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps a loading boundary out of the app root so redirects and 404s keep their status codes", () => {
    // A root loading.tsx streams every page with a 200 first: "/" then reached crawlers as an empty 200
    // page and unknown status pages became soft 404s.
    expect(existsSync(resolve(__dirname, "loading.tsx"))).toBe(false);
  });

  it("points robots.txt at this installation's sitemap and keeps signed-in areas out", async () => {
    const { robots } = await loadRoutes("https://status.example.com/");
    const result = robots();

    expect(result.sitemap).toBe("https://status.example.com/sitemap.xml");
    expect(result.rules).toMatchObject({ userAgent: "*", allow: "/" });
    const disallowed = Array.isArray(result.rules) ? [] : result.rules.disallow;
    expect(disallowed).toEqual(expect.arrayContaining(["/api/", "/dashboard", "/settings"]));
    expect(disallowed).not.toContain("/about");
    expect(disallowed).not.toContain("/login");
  });

  it("lists only the public pages in the sitemap, never status page slugs", async () => {
    const { sitemap } = await loadRoutes("https://status.example.com");

    expect(sitemap().map((entry) => entry.url)).toEqual([
      "https://status.example.com/about",
      "https://status.example.com/help",
    ]);
  });

  it("serves llms.txt in the llmstxt.org layout with absolute links", async () => {
    const { llms } = await loadRoutes("https://status.example.com");
    const response = llms();
    const body = await response.text();

    expect(response.headers.get("Content-Type")).toContain("text/markdown");
    expect(body.startsWith("# Sentrovia\n\n> ")).toBe(true);
    expect(body).toContain("## Docs");
    expect(body).toContain("(https://status.example.com/about)");
    expect(body).toContain("(https://status.example.com/help)");
  });
});
