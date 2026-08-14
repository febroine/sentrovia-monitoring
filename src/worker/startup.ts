type WorkerStartupState = {
  desiredState: string;
};

export function shouldAutoStartWorker(
  state: WorkerStartupState,
  autoStartEnabled: boolean,
  previousProcessAlive: boolean
) {
  if (!autoStartEnabled || state.desiredState === "running") {
    return false;
  }

  return !previousProcessAlive;
}
