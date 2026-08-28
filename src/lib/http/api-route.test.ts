import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AuthError } from "@/lib/auth/errors";
import {
  apiErrorResponse,
  parseJsonRequest,
  requireMutationSession,
} from "@/lib/http/api-route";

function createJsonRequest(body: unknown) {
  return new NextRequest("https://sentrovia.test/api/example", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      host: "sentrovia.test",
      origin: "https://sentrovia.test",
      "sec-fetch-site": "same-origin",
    },
  });
}

describe("API route helpers", () => {
  it("returns schema-validated JSON data", async () => {
    const schema = z.object({ name: z.string().trim().min(1) });

    await expect(parseJsonRequest(createJsonRequest({ name: "Monitor" }), schema, "Invalid input."))
      .resolves.toEqual({ name: "Monitor" });
  });

  it("returns the first validation issue as a client error", async () => {
    const schema = z.object({ name: z.string().min(1, "Name is required.") });

    await expect(parseJsonRequest(createJsonRequest({ name: "" }), schema, "Invalid input."))
      .rejects.toMatchObject({ message: "Name is required.", status: 400 });
  });

  it("preserves known error status and message in JSON responses", async () => {
    const response = apiErrorResponse(new AuthError("Conflict.", 409), "Request failed.");

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ message: "Conflict." });
  });

  it("rejects cross-origin mutations before session lookup", async () => {
    const request = new NextRequest("https://sentrovia.test/api/example", {
      method: "POST",
      headers: {
        host: "sentrovia.test",
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
    });

    await expect(requireMutationSession(request)).rejects.toMatchObject({ status: 403 });
  });
});
