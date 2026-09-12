export interface DashboardActivationStep {
  id: string;
  label: string;
  href: string;
  complete: boolean;
}

export interface DashboardActivation {
  steps: DashboardActivationStep[];
  completed: number;
  complete: boolean;
}

export function getActivationProgress(activation: DashboardActivation) {
  const total = activation.steps.length;
  const completed = activation.steps.filter((step) => step.complete).length;
  const nextStep = activation.steps.find((step) => !step.complete) ?? activation.steps[0] ?? null;

  return {
    completed,
    total,
    percent: total === 0 ? 100 : Math.round((completed / total) * 100),
    nextStep,
  };
}
