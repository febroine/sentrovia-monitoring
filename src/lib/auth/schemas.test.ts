import { describe, expect, it } from "vitest";
import { getValidationFieldErrors, onboardingSchema } from "@/lib/auth/schemas";

describe("getValidationFieldErrors", () => {
  it("returns the first validation message for each onboarding field", () => {
    const result = onboardingSchema.safeParse({
      firstName: "A",
      lastName: "B",
      username: "x",
      email: "invalid",
      password: "short",
      confirmPassword: "different",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }

    expect(getValidationFieldErrors(result.error)).toMatchObject({
      firstName: "First name must be at least 2 characters long.",
      lastName: "Last name must be at least 2 characters long.",
      username: "Username must be at least 3 characters long.",
      email: "Enter a valid email address.",
      password: "Password must be at least 12 characters long.",
      confirmPassword: "Passwords do not match.",
    });
  });
});
