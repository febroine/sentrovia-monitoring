import { describe, expect, it } from "vitest";
import {
  normalizePublicStatusSlug,
  publicStatusBackupPageSchema,
  publicStatusPageInputSchema,
} from "@/lib/public-status/schemas";

describe("public status page schemas", () => {
  it("normalizes user-entered slugs before validation", () => {
    const parsed = publicStatusPageInputSchema.parse({
      companyId: "00000000-0000-4000-8000-000000000001",
      slug: "  Northstar Labs Status  ",
      title: "Northstar status",
      summary: "",
      isEnabled: true,
    });

    expect(parsed.slug).toBe("northstar-labs-status");
  });

  it("rejects a slug that becomes too short after normalization", () => {
    expect(() => publicStatusPageInputSchema.parse({
      companyId: null,
      slug: " !! ",
      title: "",
      summary: "",
      isEnabled: true,
    })).toThrow("at least 3 characters");
  });

  it("accepts company and workspace backup scopes", () => {
    const pages = publicStatusBackupPageSchema.array().parse([
      { companyName: "Northstar Labs", slug: "northstar", title: "", summary: "", isEnabled: true },
      { companyName: null, slug: "workspace", title: "", summary: "", isEnabled: false },
    ]);

    expect(pages.map((page) => page.companyName)).toEqual(["Northstar Labs", null]);
  });

  it("keeps slug normalization deterministic", () => {
    expect(normalizePublicStatusSlug("A---B / C")).toBe("a-b-c");
  });
});
