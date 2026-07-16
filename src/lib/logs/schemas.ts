import { z } from "zod";

export const logFiltersSchema = z.object({
  search: z.string(),
  level: z.string(),
  companyQuery: z.string(),
  monitorQuery: z.string(),
  from: z.string(),
  to: z.string(),
  statusCode: z.string(),
});

export const logPresetInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  filters: logFiltersSchema,
});
