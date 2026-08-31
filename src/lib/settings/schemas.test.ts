import { describe, expect, it } from "vitest";
import { profileSettingsSchema, settingsSchema } from "@/lib/settings/schemas";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";

describe("settings schema", () => {
  it("normalizes profile login identifiers", () => {
    const input = buildSettingsPayload();
    input.profile.email = "  Admin@Example.COM ";
    input.profile.username = "  Workspace.Admin ";

    const result = settingsSchema.parse(input);

    expect(result.profile.email).toBe("admin@example.com");
    expect(result.profile.username).toBe("workspace.admin");
  });

  it("rejects profile usernames that cannot be used to log in", () => {
    const input = buildSettingsPayload();
    input.profile.username = "invalid username";

    expect(settingsSchema.safeParse(input).success).toBe(false);
  });

  it("keeps public status disabled when legacy payloads omit it", () => {
    const legacyPayload = { ...buildSettingsPayload(), publicStatus: undefined };

    const parsed = settingsSchema.parse(legacyPayload);

    expect(parsed.publicStatus).toEqual({
      enabled: false,
      slug: "",
      title: "",
      summary: "",
      companyId: "",
    });
  });

  it("maps the retired dashboard banner field in older backups", () => {
    const input = buildSettingsPayload();
    const legacyAppearance = Object.fromEntries(
      Object.entries(input.appearance).filter(([key]) => key !== "showOutageBanner")
    );

    const parsed = settingsSchema.parse({
      ...input,
      appearance: { ...legacyAppearance, showIncidentBanner: false },
    });

    expect(parsed.appearance.showOutageBanner).toBe(false);
    expect(parsed.appearance).not.toHaveProperty("showIncidentBanner");
  });

  it("normalizes public status slugs", () => {
    const parsed = settingsSchema.parse({
      ...buildSettingsPayload(),
      publicStatus: {
        enabled: true,
        slug: "My Status Page!!",
        title: "",
        summary: "",
        companyId: "",
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
        companyId: "",
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects malformed public status company ids", () => {
    const parsed = settingsSchema.safeParse({
      ...buildSettingsPayload(),
      publicStatus: {
        ...buildSettingsPayload().publicStatus,
        companyId: "holding",
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

  it("requires at least two checks before confirming a failure", () => {
    const parsed = settingsSchema.safeParse({
      ...buildSettingsPayload(),
      monitoring: {
        ...buildSettingsPayload().monitoring,
        retries: 1,
      },
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts an optional slow-response threshold below the hard timeout", () => {
    const parsed = settingsSchema.parse({
      ...buildSettingsPayload(),
      monitoring: {
        ...buildSettingsPayload().monitoring,
        timeout: 50_000,
        slowResponseThresholdMs: 20_000,
      },
    });

    expect(parsed.monitoring.slowResponseThresholdMs).toBe(20_000);
  });

  it("rejects a slow-response threshold at or above the hard timeout", () => {
    const parsed = settingsSchema.safeParse({
      ...buildSettingsPayload(),
      monitoring: {
        ...buildSettingsPayload().monitoring,
        timeout: 50_000,
        slowResponseThresholdMs: 50_000,
      },
    });

    expect(parsed.success).toBe(false);
  });
});

describe("personal profile schema", () => {
  it("normalizes login identifiers without accepting a role", () => {
    const parsed = profileSettingsSchema.parse({
      firstName: " View ",
      lastName: " User ",
      email: " Viewer@Example.COM ",
      department: " Operations ",
      username: " View.User ",
      organization: " Sentrovia ",
      jobTitle: " Observer ",
      phone: " ",
      role: "admin",
    });

    expect(parsed).toEqual({
      firstName: "View",
      lastName: "User",
      email: "viewer@example.com",
      department: "Operations",
      username: "view.user",
      organization: "Sentrovia",
      jobTitle: "Observer",
      phone: "",
    });
    expect(parsed).not.toHaveProperty("role");
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
