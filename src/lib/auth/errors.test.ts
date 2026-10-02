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

  it("maps normalized company name conflicts to the correct message", () => {
    const error = toAuthError(
      { code: "23505", constraint: "companies_user_normalized_name_unique" },
      "Unable to save."
    );

    expect(error.status).toBe(409);
    expect(error.message).toBe("A company with this name already exists.");
  });

  it("maps heartbeat token conflicts without exposing database details", () => {
    const error = toAuthError(
      { code: "23505", constraint: "monitors_heartbeat_token_unique" },
      "Unable to save monitor."
    );

    expect(error.status).toBe(409);
    expect(error.message).toContain("heartbeat token is already in use");
  });

  it("maps serializable transaction conflicts to a retryable response", () => {
    const error = toAuthError(
      { cause: { code: "40001", message: "could not serialize access" } },
      "Unable to save."
    );

    expect(error.status).toBe(409);
    expect(error.message).toContain("changed during this operation");
  });
});

describe("unique constraint messages", () => {
  // postgres.js reports the violated index as constraint_name, wrapped by drizzle in `cause`.
  const violation = (constraint_name: string) => ({ message: "Failed query", cause: { code: "23505", constraint_name, message: "duplicate key" } });

  it("names what is duplicated", () => {
    expect(toAuthError(violation("companies_workspace_normalized_name_unique"), "x").message).toBe("A company with this name already exists.");
    expect(toAuthError(violation("users_email_unique"), "x").message).toBe("An account with this email already exists.");
    expect(toAuthError(violation("users_username_unique"), "x").message).toBe("An account with this username already exists.");
    expect(toAuthError(violation("public_status_pages_slug_unique"), "x").message).toBe("Public status slug is already in use.");
    expect(toAuthError(violation("public_status_pages_workspace_company_unique"), "x").message).toBe("A public status page already exists for this scope.");
    expect(toAuthError(violation("log_filter_presets_user_name_unique"), "x").message).toBe("A saved filter with this name already exists.");
  });

  it("does not blame an email address for an unknown duplicate", () => {
    expect(toAuthError(violation(""), "x").message).toBe("A record with this value already exists.");
    expect(toAuthError(violation(""), "x").status).toBe(409);
  });
});
