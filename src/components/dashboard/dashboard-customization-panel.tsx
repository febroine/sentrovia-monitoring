"use client";

import { ArrowDown, ArrowUp, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  orderDashboardWidgetOptions,
  type DashboardPreferences,
  type DashboardWidgetId,
} from "@/lib/dashboard/preferences";
import type { DashboardData } from "@/lib/dashboard/service";

const WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  summary: "Summary metrics",
  system: "System health",
  "monitor-focus": "Monitor focus",
  "company-health": "Company health",
  "recent-events": "Recent events",
  delivery: "Notification delivery",
};

export function DashboardCustomizationPanel({
  preferences,
  companyOptions,
  isAdmin,
  saving,
  onChange,
  onSave,
  onClose,
}: {
  preferences: DashboardPreferences;
  companyOptions: DashboardData["companyOptions"];
  isAdmin: boolean;
  saving: boolean;
  onChange: (preferences: DashboardPreferences) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const widgets = preferences.widgets.filter((widget) => isAdmin || widget !== "system");
  const widgetOptions = orderDashboardWidgetOptions(widgets, isAdmin);

  function toggleWidget(widget: DashboardWidgetId, enabled: boolean) {
    if (!enabled && widgets.length === 1) {
      return;
    }

    const nextWidgets = enabled
      ? [...widgets, widget]
      : widgets.filter((item) => item !== widget);
    onChange({ ...preferences, widgets: nextWidgets });
  }

  function moveWidget(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= widgets.length) {
      return;
    }

    const nextWidgets = [...widgets];
    [nextWidgets[index], nextWidgets[nextIndex]] = [nextWidgets[nextIndex], nextWidgets[index]];
    onChange({ ...preferences, widgets: nextWidgets });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">Customize dashboard</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose visible widgets, their order, and monitor scope.
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close dashboard customization" title="Close">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-2">
          <Label>Widgets and order</Label>
          <div className="divide-y border-y">
            {widgetOptions.map((widget) => {
              const index = widgets.indexOf(widget);
              const enabled = index >= 0;
              return (
                <div key={widget} className="flex items-center gap-2 py-2">
                  <Switch checked={enabled} onCheckedChange={(checked) => toggleWidget(widget, checked)} aria-label={`Show ${WIDGET_LABELS[widget]}`} />
                  <span className={`min-w-0 flex-1 text-sm ${enabled ? "" : "text-muted-foreground"}`}>
                    {WIDGET_LABELS[widget]}
                  </span>
                  <Button variant="ghost" size="icon-sm" disabled={!enabled || index === 0} onClick={() => moveWidget(index, -1)} aria-label={`Move ${WIDGET_LABELS[widget]} up`} title="Move up">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" disabled={!enabled || index === widgets.length - 1} onClick={() => moveWidget(index, 1)} aria-label={`Move ${WIDGET_LABELS[widget]} down`} title="Move down">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dashboard-company">Company scope</Label>
            <Select value={preferences.companyId || "all"} onValueChange={(value) => onChange({ ...preferences, companyId: value === "all" ? "" : String(value) })}>
              <SelectTrigger id="dashboard-company"><SelectValue placeholder="All companies" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies</SelectItem>
                {companyOptions.map((company) => <SelectItem key={company.id} value={company.id}>{company.name} ({company.monitorCount})</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">The selected scope is remembered for your next visit.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dashboard-focus">Monitor focus</Label>
            <Select value={preferences.focus} onValueChange={(value) => onChange({ ...preferences, focus: value as DashboardPreferences["focus"] })}>
              <SelectTrigger id="dashboard-focus"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All active monitors</SelectItem>
                <SelectItem value="favorites">Favorites only</SelectItem>
                <SelectItem value="critical">Critical monitors</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Critical and favorite monitors lead; outage state breaks ties.</p>
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2 border-t border-border/60 pt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={onSave} disabled={saving}>
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save dashboard"}
        </Button>
      </CardFooter>
    </Card>
  );
}
