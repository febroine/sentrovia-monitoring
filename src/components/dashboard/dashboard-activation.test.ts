import { describe, expect, it } from "vitest";
import { getActivationProgress, type DashboardActivation } from "@/components/dashboard/dashboard-activation";

describe("dashboard activation progress", () => {
  it("selects the next incomplete step and calculates compact progress", () => {
    const progress = getActivationProgress(buildActivation({
      completed: 0,
      steps: [
        { id: "monitor", label: "Create a monitor", href: "/monitoring", complete: true },
        { id: "worker", label: "Verify the worker", href: "/monitoring", complete: false },
        { id: "delivery", label: "Complete a delivery", href: "/delivery", complete: false },
      ],
    }));

    expect(progress).toMatchObject({ completed: 1, total: 3, percent: 33 });
    expect(progress.nextStep).toMatchObject({ id: "worker", href: "/monitoring" });
  });

  it("treats an empty checklist as complete without dividing by zero", () => {
    expect(getActivationProgress(buildActivation({ steps: [], completed: 0, complete: true }))).toEqual({
      completed: 0,
      total: 0,
      percent: 100,
      nextStep: null,
    });
  });
});

function buildActivation(overrides: Partial<DashboardActivation>): DashboardActivation {
  return {
    completed: 0,
    complete: false,
    steps: [],
    ...overrides,
  };
}
