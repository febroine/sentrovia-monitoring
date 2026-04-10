import { z } from "zod";

export const companyInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  isActive: z.boolean().default(true),
});

export const companyBulkActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  action: z.enum(["activate", "deactivate", "delete"]),
});

export type CompanyInput = z.infer<typeof companyInputSchema>;
