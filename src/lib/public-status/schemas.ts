import { z } from "zod";

const normalizedSlug = z
  .string()
  .trim()
  .max(120)
  .transform(normalizePublicStatusSlug)
  .pipe(z.string().min(3, "Public status slug must be at least 3 characters."));

export const publicStatusPageInputSchema = z.object({
  companyId: z.string().uuid().nullable().default(null),
  slug: normalizedSlug,
  title: z.string().trim().max(160).default(""),
  summary: z.string().trim().max(500).default(""),
  isEnabled: z.boolean().default(true),
});

export const publicStatusBackupPageSchema = z.object({
  companyName: z.string().trim().min(1).max(160).nullable(),
  slug: normalizedSlug,
  title: z.string().trim().max(160).default(""),
  summary: z.string().trim().max(500).default(""),
  isEnabled: z.boolean().default(true),
});

export type PublicStatusPageInput = z.infer<typeof publicStatusPageInputSchema>;
export type PublicStatusBackupPage = z.infer<typeof publicStatusBackupPageSchema>;

export function normalizePublicStatusSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
