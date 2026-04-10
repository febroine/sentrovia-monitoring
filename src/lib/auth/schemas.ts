import { z } from "zod";

const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters long.")
  .max(128, "Password must be 128 characters or fewer.")
  .regex(/[a-z]/, "Password must include at least one lowercase letter.")
  .regex(/[A-Z]/, "Password must include at least one uppercase letter.")
  .regex(/[0-9]/, "Password must include at least one number.")
  .regex(/[^A-Za-z0-9]/, "Password must include at least one special character.");

export const registerSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(2, "First name must be at least 2 characters long.")
      .max(80, "First name is too long."),
    lastName: z
      .string()
      .trim()
      .min(2, "Last name must be at least 2 characters long.")
      .max(80, "Last name is too long."),
    email: z
      .string()
      .trim()
      .email("Enter a valid email address.")
      .transform((value) => value.toLowerCase()),
    department: z
      .string()
      .trim()
      .max(120, "Department is too long.")
      .optional()
      .transform((value) => (value && value.length > 0 ? value : null)),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your password."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email address.")
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1, "Password is required."),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Please confirm your new password."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export function flattenValidationIssues(error: z.ZodError) {
  const fieldErrors = Object.values(error.flatten().fieldErrors)
    .flat()
    .filter((value): value is string => Boolean(value));

  return fieldErrors[0] ?? "Please review the highlighted fields.";
}
