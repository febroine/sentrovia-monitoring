import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, type SettingsPayload } from "@/lib/settings/types";
import { useSettingsStore } from "@/stores/use-settings-store";

describe("settings store save races", () => {
  beforeEach(() => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    useSettingsStore.setState({
      settings,
      persistedSettings: structuredClone(settings),
      loading: false,
      saving: false,
      error: null,
      message: null,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves profile edits made while a save request is pending", async () => {
    const pendingResponse = createPendingResponse();
    vi.stubGlobal("fetch", vi.fn(() => pendingResponse.promise));
    useSettingsStore.getState().updateSetting("profile.firstName", "Submitted");

    const save = useSettingsStore.getState().saveProfile();
    useSettingsStore.getState().updateSetting("profile.firstName", "Edited later");
    pendingResponse.resolve(jsonResponse({
      profile: { ...DEFAULT_SETTINGS.profile, firstName: "Submitted" },
    }));
    await save;

    expect(useSettingsStore.getState().settings.profile.firstName).toBe("Edited later");
    expect(useSettingsStore.getState().persistedSettings.profile.firstName).toBe("Submitted");
  });

  it("preserves section edits made while a settings save is pending", async () => {
    const pendingResponse = createPendingResponse();
    vi.stubGlobal("fetch", vi.fn(() => pendingResponse.promise));
    useSettingsStore.getState().updateSetting("notifications.notifyOnDown", false);

    const save = useSettingsStore.getState().saveSettings("alert-conditions");
    useSettingsStore.getState().updateSetting("notifications.notifyOnDown", true);
    const savedSettings: SettingsPayload = structuredClone(DEFAULT_SETTINGS);
    savedSettings.notifications.notifyOnDown = false;
    pendingResponse.resolve(jsonResponse({ settings: savedSettings }));
    await save;

    expect(useSettingsStore.getState().settings.notifications.notifyOnDown).toBe(true);
    expect(useSettingsStore.getState().persistedSettings.notifications.notifyOnDown).toBe(false);
  });
});

function createPendingResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
