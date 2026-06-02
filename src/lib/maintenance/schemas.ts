import { z } from "zod";

export const maintenanceScopeSchema = z.enum(["all", "monitors", "companies", "tags"]);
export const maintenanceRecurrenceSchema = z.enum(["none", "daily", "weekly"]);

export const maintenanceWindowInputSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    timezone: z.string().trim().min(1).max(64).default("Europe/Istanbul"),
    recurrence: maintenanceRecurrenceSchema.default("none"),
    scope: maintenanceScopeSchema.default("all"),
    monitorIds: z.array(z.string().trim().min(1)).max(200).default([]),
    companyIds: z.array(z.string().trim().min(1)).max(200).default([]),
    tags: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
    isActive: z.boolean().default(true),
    suppressNotifications: z.boolean().default(true),
    suppressChecks: z.boolean().default(false),
    reason: z.string().trim().max(1000).default(""),
  })
  .superRefine((value, context) => {
    const startsAt = new Date(value.startsAt);
    const endsAt = new Date(value.endsAt);

    if (Number.isNaN(startsAt.getTime())) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["startsAt"], message: "Enter a valid start time." });
    }

    if (Number.isNaN(endsAt.getTime())) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "Enter a valid end time." });
    }

    if (!Number.isNaN(startsAt.getTime()) && !Number.isNaN(endsAt.getTime()) && endsAt <= startsAt) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "End time must be after start time." });
    }

    if (!isValidTimeZone(value.timezone)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["timezone"], message: "Enter a valid IANA timezone." });
    }

    if (value.scope === "monitors" && value.monitorIds.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["monitorIds"], message: "Select at least one monitor." });
    }

    if (value.scope === "companies" && value.companyIds.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["companyIds"], message: "Select at least one company." });
    }

    if (value.scope === "tags" && value.tags.length === 0) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["tags"], message: "Select at least one tag." });
    }
  });

export type MaintenanceWindowInput = z.infer<typeof maintenanceWindowInputSchema>;

function isValidTimeZone(timezone: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
