import type { IntervalUnit } from "@/lib/monitors/types";

export function intervalToMs(intervalValue: number, intervalUnit: IntervalUnit | string) {
  if (intervalUnit === "sn") return intervalValue * 1_000;
  if (intervalUnit === "sa") return intervalValue * 60 * 60 * 1_000;
  return intervalValue * 60 * 1_000;
}
