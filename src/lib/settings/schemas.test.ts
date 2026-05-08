import { describe, expect, it } from "vitest";
import { settingsSchema } from "@/lib/settings/schemas";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";

describe("settings schema", () => {
  it("keeps public status disabled when legacy payloads omit it", () => {
    const legacyPayload = { ...buildSettingsPayload(), publicStatus: undefined };

    const parsed = settingsSchema.parse(legacyPayload);

    expect(parsed.publicStatus).toEqual({
      enabled: false,
      slug: "",
      title: "",
      summary: "",
    });
  });

  it("normalizes public status slugs", () => {
    const parsed = settingsSchema.parse({
      ...buildSettingsPayload(),
      publicStatus: {
        enabled: true,
        slug: "My Status Page!!",
        title: "",
        summary: "",
      },
    });

    expect(parsed.publicStatus.slug).toBe("my-status-page");
  });

  it("requires a public status slug when publishing is enabled", () => {
    const parsed = settingsSchema.safeParse({
      ...buildSettingsPayload(),
      publicStatus: {
        enabled: true,
        slug: "",
        title: "",
        summary: "",
      },
    });

    expect(parsed.success).toBe(false);
  });
});

function buildSettingsPayload() {
  return {
    ...DEFAULT_SETTINGS,
    profile: {
      ...DEFAULT_SETTINGS.profile,
      firstName: "Aykut",
      lastName: "Bayram",
      email: "aykut@example.com",
    },
  };
}
