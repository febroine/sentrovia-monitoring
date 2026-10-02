// Runs a refresh on an interval while the page is visible, and once more as soon as a hidden tab is
// shown again, so a background tab does not keep querying the server for screens nobody is looking at.
// Returns the cleanup for a React effect.
export function startVisiblePolling(refresh: () => void, intervalMs: number) {
  const intervalId = window.setInterval(() => {
    if (document.visibilityState !== "hidden") refresh();
  }, intervalMs);
  const handleVisibility = () => {
    if (document.visibilityState === "visible") refresh();
  };
  document.addEventListener("visibilitychange", handleVisibility);
  return () => {
    window.clearInterval(intervalId);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}
