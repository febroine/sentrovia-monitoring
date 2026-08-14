export const DASHBOARD_WIDGET_IDS = [
  "summary",
  "system",
  "monitor-focus",
  "company-health",
  "recent-events",
  "delivery",
] as const;

export type DashboardWidgetId = (typeof DASHBOARD_WIDGET_IDS)[number];
export type DashboardFocus = "all" | "favorites" | "critical";

export interface DashboardPreferences {
  widgets: DashboardWidgetId[];
  companyId: string;
  focus: DashboardFocus;
}

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
  widgets: [...DASHBOARD_WIDGET_IDS],
  companyId: "",
  focus: "all",
};

export function normalizeDashboardPreferences(input: Partial<DashboardPreferences> | null | undefined) {
  const widgets = normalizeDashboardWidgets(input?.widgets);
  const companyId = typeof input?.companyId === "string" ? input.companyId : "";
  const focus = isDashboardFocus(input?.focus) ? input.focus : DEFAULT_DASHBOARD_PREFERENCES.focus;

  return { widgets, companyId, focus } satisfies DashboardPreferences;
}

function normalizeDashboardWidgets(value: unknown) {
  if (!Array.isArray(value)) {
    return [...DEFAULT_DASHBOARD_PREFERENCES.widgets];
  }

  const widgets = value.filter(isDashboardWidgetId);
  return widgets.length > 0 ? Array.from(new Set(widgets)) : [...DEFAULT_DASHBOARD_PREFERENCES.widgets];
}

function isDashboardWidgetId(value: unknown): value is DashboardWidgetId {
  return typeof value === "string" && (DASHBOARD_WIDGET_IDS as readonly string[]).includes(value);
}

function isDashboardFocus(value: unknown): value is DashboardFocus {
  return value === "all" || value === "favorites" || value === "critical";
}

export function parseDashboardWidgets(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
