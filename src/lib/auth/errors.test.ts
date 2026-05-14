import { describe, expect, it } from "vitest";
import { toAuthError } from "@/lib/auth/errors";

describe("auth error mapping", () => {
  it("maps malformed JSON request bodies to a client error", () => {
    const error = toAuthError(new SyntaxError("Unexpected token"), "Unable to save.");

    expect(error.status).toBe(400);
    expect(error.message).toBe("Invalid JSON request body.");
  });
});
