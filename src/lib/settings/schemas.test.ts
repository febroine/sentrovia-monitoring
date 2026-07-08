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

  it("rejects invalid SMTP email addresses", () => {
    const parsed = settingsSchema.safeParse({
      ...buildSettingsPayload(),
      notifications: {
        ...buildSettingsPayload().notifications,
        smtpFromEmail: "not-an-email",
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("normalizes saved notification recipients", () => {
    const parsed = settingsSchema.parse({
      ...buildSettingsPayload(),
      notifications: {
        ...buildSettingsPayload().notifications,
        savedEmailRecipients: ["Ops@Example.com", "ops@example.com", "noc@example.com"],
      },
    });

    expect(parsed.notifications.savedEmailRecipients).toEqual(["ops@example.com", "noc@example.com"]);
  });

  it("defaults legacy notification language to English", () => {
    const parsed = settingsSchema.parse({
      ...buildSettingsPayload(),
      notifications: {
        ...buildSettingsPayload().notifications,
        notificationLanguage: undefined,
      },
    });

    expect(parsed.notifications.notificationLanguage).toBe("en");
  });

  it("accepts Turkish notification language", () => {
    const parsed = settingsSchema.parse({
      ...buildSettingsPayload(),
      notifications: {
        ...buildSettingsPayload().notifications,
        notificationLanguage: "tr",
      },
    });

    expect(parsed.notifications.notificationLanguage).toBe("tr");
  });

  it("normalizes valid monitoring intervals", () => {
    const parsed = settingsSchema.parse({
      ...buildSettingsPayload(),
      monitoring: {
        ...buildSettingsPayload().monitoring,
        interval: "15 dk",
      },
    });

    expect(parsed.monitoring.interval).toBe("15m");
  });

  it("rejects invalid monitoring interval formats", () => {
    const parsed = settingsSchema.safeParse({
      ...buildSettingsPayload(),
      monitoring: {
        ...buildSettingsPayload().monitoring,
        interval: "soon",
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects monitoring intervals that cannot become monitor defaults", () => {
    const parsed = settingsSchema.safeParse({
      ...buildSettingsPayload(),
      monitoring: {
        ...buildSettingsPayload().monitoring,
        interval: "1441m",
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
