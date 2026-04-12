import { z } from "zod";

export const reportPreviewSchema = z.object({
  scope: z.enum(["global", "company"]),
  cadence: z.enum(["weekly", "monthly"]),
  template: z.enum(["executive", "operations", "client"]).default("operations"),
  companyId: z.string().trim().max(120).nullable().optional(),
});

export const reportScheduleSchema = reportPreviewSchema.extend({
  name: z.string().trim().min(3).max(160),
  recipientEmails: z.array(z.string().trim().email()).min(1).max(25),
  isActive: z.boolean().default(true),
  nextRunAt: z.string().datetime().nullable().optional(),
});

export const reportSchedulePatchSchema = reportScheduleSchema.partial().extend({
  id: z.string().trim().min(1).optional(),
});

export const reportDispatchSchema = reportPreviewSchema.extend({
  recipientEmails: z.array(z.string().trim().email()).min(1).max(25),
});

export type ReportPreviewPayload = z.infer<typeof reportPreviewSchema>;
export type ReportSchedulePayload = z.infer<typeof reportScheduleSchema>;
export type ReportSchedulePatchPayload = z.infer<typeof reportSchedulePatchSchema>;
export type ReportDispatchPayload = z.infer<typeof reportDispatchSchema>;
