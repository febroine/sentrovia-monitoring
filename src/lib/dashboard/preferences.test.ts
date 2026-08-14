import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_PREFERENCES,
  normalizeDashboardPreferences,
  parseDashboardWidgets,
} from "@/lib/dashboard/preferences";

describe("dashboard preferences", () => {
  it("removes duplicate or unsupported widgets while keeping a usable layout", () => {
    expect(normalizeDashboardPreferences({ widgets: ["summary", "summary", "unknown"] as never, focus: "critical" })).toEqual({
      ...DEFAULT_DASHBOARD_PREFERENCES,
      widgets: ["summary"],
      focus: "critical",
    });
  });

  it("falls back to defaults for malformed stored values", () => {
    expect(normalizeDashboardPreferences({ widgets: [], companyId: 42 as never, focus: "invalid" as never })).toEqual(
      DEFAULT_DASHBOARD_PREFERENCES
    );
    expect(parseDashboardWidgets("not-json")).toBeNull();
  });
});
