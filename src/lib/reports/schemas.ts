import { z } from "zod";

const reportScopeSchema = z.enum(["global", "company"]);
const reportCadenceSchema = z.enum(["weekly", "monthly", "all_time"]);
const reportTemplateSchema = z.enum(["executive", "operations", "client"]);
const deliveryDetailLevelSchema = z.enum(["summary", "standard", "full"]);
const companyIdSchema = z.string().trim().max(120).nullable().optional();
const recipientEmailsSchema = z.array(z.string().trim().email()).min(1).max(25);
const optionalTemplateStringSchema = z.string().trim().max(1000).nullable().optional();
const optionalBrandNameSchema = z.string().trim().max(120).nullable().optional();

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
};

export const reportPreviewSchema = z.object(reportPreviewShape);

export const reportScheduleSchema = z.object({
  ...reportPreviewShape,
  name: z.string().trim().min(3).max(160),
  recipientEmails: recipientEmailsSchema,
  isActive: z.boolean().default(true),
  nextRunAt: z.string().datetime().nullable().optional(),
});

export const reportSchedulePatchSchema = z.object({
  id: z.string().trim().min(1).optional(),
  scope: reportScopeSchema.optional(),
  cadence: reportCadenceSchema.optional(),
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
});
