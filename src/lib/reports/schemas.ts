import { z } from "zod";

const reportScopeSchema = z.enum(["global", "company"]);
const reportCadenceSchema = z.enum(["weekly", "monthly", "all_time"]);
const reportScheduleCadenceSchema = z.enum(["weekly", "monthly"]);
const reportTemplateSchema = z.enum(["executive", "operations", "client"]);
const deliveryDetailLevelSchema = z.enum(["summary", "standard", "full"]);
const companyIdSchema = z.string().trim().max(120).nullable().optional();
const recipientEmailsSchema = z.array(z.string().trim().email()).min(1).max(25);
const optionalTemplateStringSchema = z.string().trim().max(1000).nullable().optional();
const optionalBrandNameSchema = z.string().trim().max(120).nullable().optional();
const reportPeriodRangeSchema = z.enum(["7d", "30d", "custom"]);
const optionalPeriodBoundarySchema = z.string().datetime({ offset: true }).optional();

const reportPreviewShape = {
  scope: reportScopeSchema,
  cadence: reportCadenceSchema,
  template: reportTemplateSchema.default("operations"),
  companyId: companyIdSchema,
  deliveryDetailLevel: deliveryDetailLevelSchema.default("standard"),
  includeOutageSummary: z.boolean().default(true),
  includeMonitorBreakdown: z.boolean().default(true),
  emailSubjectTemplate: optionalTemplateStringSchema,
  emailIntroTemplate: optionalTemplateStringSchema,
  reportBrandName: optionalBrandNameSchema,
  periodRange: reportPeriodRangeSchema.optional(),
  periodStartedAt: optionalPeriodBoundarySchema,
  periodEndedAt: optionalPeriodBoundarySchema,
  timeZone: z.string().trim().min(1).max(80).optional(),
};

export const reportPreviewSchema = z.object(reportPreviewShape).superRefine(validateReportPeriod);

export const reportScheduleSchema = z.object({
  ...reportPreviewShape,
  cadence: reportScheduleCadenceSchema,
  name: z.string().trim().min(3).max(160),
  recipientEmails: recipientEmailsSchema,
  isActive: z.boolean().default(true),
  nextRunAt: z.string().datetime().nullable().optional(),
}).omit({ periodRange: true, periodStartedAt: true, periodEndedAt: true, timeZone: true });

export const reportSchedulePatchSchema = z.object({
  id: z.string().trim().min(1).optional(),
  scope: reportScopeSchema.optional(),
  cadence: reportScheduleCadenceSchema.optional(),
  template: reportTemplateSchema.optional(),
  companyId: companyIdSchema,
  deliveryDetailLevel: deliveryDetailLevelSchema.optional(),
  includeOutageSummary: z.boolean().optional(),
  includeMonitorBreakdown: z.boolean().optional(),
  emailSubjectTemplate: optionalTemplateStringSchema,
  emailIntroTemplate: optionalTemplateStringSchema,
  reportBrandName: optionalBrandNameSchema,
  name: z.string().trim().min(3).max(160).optional(),
  recipientEmails: recipientEmailsSchema.optional(),
  isActive: z.boolean().optional(),
  nextRunAt: z.string().datetime().nullable().optional(),
});

export const reportDispatchSchema = z.object({
  ...reportPreviewShape,
  recipientEmails: recipientEmailsSchema,
}).superRefine(validateReportPeriod);

function validateReportPeriod(
  value: {
    periodRange?: "7d" | "30d" | "custom";
    periodStartedAt?: string;
    periodEndedAt?: string;
    timeZone?: string;
  },
  context: z.RefinementCtx
) {
  if (value.timeZone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value.timeZone });
    } catch {
      context.addIssue({ code: "custom", path: ["timeZone"], message: "Invalid report time zone." });
    }
  }

  if (value.periodRange !== "custom") {
    return;
  }

  if (!value.periodStartedAt || !value.periodEndedAt) {
    context.addIssue({
      code: "custom",
      path: ["periodStartedAt"],
      message: "Custom reports require start and end timestamps.",
    });
    return;
  }

  const startedAt = new Date(value.periodStartedAt);
  const endedAt = new Date(value.periodEndedAt);
  if (startedAt >= endedAt) {
    context.addIssue({ code: "custom", path: ["periodEndedAt"], message: "Report end must be after its start." });
  }
  if (endedAt.getTime() - startedAt.getTime() > 366 * 24 * 60 * 60_000) {
    context.addIssue({ code: "custom", path: ["periodEndedAt"], message: "Custom reports cannot exceed 366 days." });
  }
}
