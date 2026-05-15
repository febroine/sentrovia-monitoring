import { describe, expect, it } from "vitest";
import { toAuthError } from "@/lib/auth/errors";

describe("auth error mapping", () => {
  it("maps malformed JSON request bodies to a client error", () => {
    const error = toAuthError(new SyntaxError("Unexpected token"), "Unable to save.");

    expect(error.status).toBe(400);
    expect(error.message).toBe("Invalid JSON request body.");
  });

  it("maps public status slug unique conflicts to the correct message", () => {
    const error = toAuthError(
      { code: "23505", constraint: "user_settings_public_status_slug_unique" },
      "Unable to save."
    );

    expect(error.status).toBe(409);
    expect(error.message).toBe("Public status slug is already in use.");
  });
});
