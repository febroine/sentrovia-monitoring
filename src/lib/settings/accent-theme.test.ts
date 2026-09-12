import { describe, expect, it } from "vitest";
import { ACCENT_OPTIONS, accentThemes, normalizeSidebarAccent } from "@/lib/settings/accent-theme";

describe("accent theme", () => {
  it("normalizes unknown settings values to emerald", () => {
    expect(normalizeSidebarAccent("not-a-color")).toBe("emerald");
    expect(normalizeSidebarAccent(undefined)).toBe("emerald");
  });

  it("maps each selectable accent to primary and emerald-compatible variables", () => {
    expect(ACCENT_OPTIONS).toHaveLength(15);

    for (const option of ACCENT_OPTIONS) {
      const variables = accentThemes[option.value].cssVars;

      expect(variables["--color-primary"]).toBeTruthy();
      expect(variables["--color-primary-foreground"]).toBeTruthy();
      expect(variables["--color-ring"]).toBe(variables["--color-emerald-400"]);
      expect(variables["--color-emerald-500"]).toBe(variables["--color-primary"]);
    }
  });
});
