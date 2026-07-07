import { z } from "zod";

const reportScopeSchema = z.enum(["global", "company"]);
const reportCadenceSchema = z.enum(["weekly", "monthly", "all_time"]);
const reportTemplateSchema = z.enum(["executive", "operations", "client"]);
const deliveryDetailLevelSchema = z.enum(["summary", "standard", "full"]);
const companyIdSchema = z.string().trim().max(120).nullable().optional();
const recipientEmailsSchema = z.array(z.string().trim().email()).min(1).max(25);
const optionalTemplateStringSchema = z.string().trim().max(1000).nullable().optional();
const optionalBrandNameSchema = z.string().trim().max(120).nullable().optional();

export const reportPreviewSchema = z.object({
  scope: reportScopeSchema,
  cadence: reportCadenceSchema,
  template: reportTemplateSchema.default("operations"),
  companyId: companyIdSchema,
  deliveryDetailLevel: deliveryDetailLevelSchema.default("standard"),
  attachCsv: z.boolean().default(false),
  attachHtml: z.boolean().default(true),
  attachPdf: z.boolean().default(false),
  includeIncidentSummary: z.boolean().default(true),
  includeMonitorBreakdown: z.boolean().default(true),
  emailSubjectTemplate: optionalTemplateStringSchema,
  emailIntroTemplate: optionalTemplateStringSchema,
  reportBrandName: optionalBrandNameSchema,
});

export const reportScheduleSchema = reportPreviewSchema.extend({
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
  attachCsv: z.boolean().optional(),
  attachHtml: z.boolean().optional(),
  attachPdf: z.boolean().optional(),
  includeIncidentSummary: z.boolean().optional(),
  includeMonitorBreakdown: z.boolean().optional(),
  emailSubjectTemplate: optionalTemplateStringSchema,
  emailIntroTemplate: optionalTemplateStringSchema,
  reportBrandName: optionalBrandNameSchema,
  name: z.string().trim().min(3).max(160).optional(),
  recipientEmails: recipientEmailsSchema.optional(),
  isActive: z.boolean().optional(),
  nextRunAt: z.string().datetime().nullable().optional(),
});

export const reportDispatchSchema = reportPreviewSchema.extend({
  recipientEmails: recipientEmailsSchema,
});
