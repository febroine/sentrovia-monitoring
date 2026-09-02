import type { MonitorHistoryPoint } from "@/lib/monitors/types";

export function buildMonitorHistoryWindow(
  points: MonitorHistoryPoint[],
  selectedPointId: string | null
) {
  if (!selectedPointId) {
    return null;
  }

  const selectedIndex = points.findIndex((point) => point.id === selectedPointId);
  if (selectedIndex === -1) {
    return null;
  }

  const selectedPoint = points[selectedIndex];
  const startIndex = findWindowStart(points, selectedIndex, selectedPoint.status);
  const endIndex = findWindowEnd(points, selectedIndex, selectedPoint.status);
  const windowStart = points[startIndex];
  const latestWindowPoint = points[endIndex];
  const nextPoint = points[endIndex + 1] ?? null;
  const observedEnd = nextPoint ?? latestWindowPoint;

  return {
    point: selectedPoint,
    previousPoint: points[startIndex - 1] ?? null,
    nextPoint,
    windowStart,
    latestWindowPoint,
    windowPoints: points.slice(startIndex, endIndex + 1),
    isOngoing: nextPoint === null,
    observedDurationMs: Math.max(
      0,
      new Date(observedEnd.createdAt).getTime() - new Date(windowStart.createdAt).getTime()
    ),
  };
}

function findWindowStart(
  points: MonitorHistoryPoint[],
  selectedIndex: number,
  status: MonitorHistoryPoint["status"]
) {
  let index = selectedIndex;
  while (index > 0 && points[index - 1]?.status === status) {
    index -= 1;
  }
  return index;
}

function findWindowEnd(
  points: MonitorHistoryPoint[],
  selectedIndex: number,
  status: MonitorHistoryPoint["status"]
) {
  let index = selectedIndex;
  while (index < points.length - 1 && points[index + 1]?.status === status) {
    index += 1;
  }
  return index;
}
