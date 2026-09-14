import { MAX_MONITORS_PER_USER } from "@/lib/import-limits";

export const REPORT_ANALYTICS_LIMITS = {
  maxSelectedMonitors: MAX_MONITORS_PER_USER,
  maxRequestBytes: 1_500_000,
} as const;
