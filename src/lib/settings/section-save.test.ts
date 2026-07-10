import { describe, expect, it } from "vitest";
import { buildSectionSavePayload, mergeSavedSection } from "@/lib/settings/section-save";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";

describe("settings section save", () => {
  it("saves only the selected notification card", () => {
    const persisted = structuredClone(DEFAULT_SETTINGS);
    const draft = structuredClone(DEFAULT_SETTINGS);
    draft.notifications.notifyOnLatency = false;
    draft.notifications.smtpHost = "smtp.draft.example";

    const payload = buildSectionSavePayload(persisted, draft, "alert-conditions");

    expect(payload.notifications.notifyOnLatency).toBe(false);
    expect(payload.notifications.smtpHost).toBe(persisted.notifications.smtpHost);
  });

  it("keeps unsaved card edits after a section save response", () => {
    const draft = structuredClone(DEFAULT_SETTINGS);
    const saved = structuredClone(DEFAULT_SETTINGS);
    draft.notifications.smtpHost = "smtp.unsaved.example";
    draft.notifications.notifyOnLatency = false;
    saved.notifications.notifyOnLatency = false;

    const merged = mergeSavedSection(draft, saved, "alert-conditions", DEFAULT_SETTINGS);

    expect(merged.notifications.notifyOnLatency).toBe(false);
    expect(merged.notifications.smtpHost).toBe("smtp.unsaved.example");
  });

  it("refreshes untouched default templates after a language change", () => {
    const persisted = structuredClone(DEFAULT_SETTINGS);
    const draft = structuredClone(DEFAULT_SETTINGS);
    const saved = structuredClone(DEFAULT_SETTINGS);
    saved.notifications.notificationLanguage = "tr";
    saved.notifications.defaultEmailSubjectTemplate = "Turkish default";

    const merged = mergeSavedSection(draft, saved, "alert-conditions", persisted);

    expect(merged.notifications.defaultEmailSubjectTemplate).toBe("Turkish default");
  });

  it("preserves a custom template draft during a language change", () => {
    const persisted = structuredClone(DEFAULT_SETTINGS);
    const draft = structuredClone(DEFAULT_SETTINGS);
    const saved = structuredClone(DEFAULT_SETTINGS);
    draft.notifications.defaultEmailSubjectTemplate = "Unsaved custom subject";
    saved.notifications.defaultEmailSubjectTemplate = "Turkish default";

    const merged = mergeSavedSection(draft, saved, "alert-conditions", persisted);

    expect(merged.notifications.defaultEmailSubjectTemplate).toBe("Unsaved custom subject");
  });

  it("isolates top-level settings cards", () => {
    const persisted = structuredClone(DEFAULT_SETTINGS);
    const draft = structuredClone(DEFAULT_SETTINGS);
    draft.monitoring.timeout = 90_000;
    draft.appearance.reduceMotion = true;

    const payload = buildSectionSavePayload(persisted, draft, "default-monitor-configuration");

    expect(payload.monitoring.timeout).toBe(90_000);
    expect(payload.appearance.reduceMotion).toBe(false);
  });
});
