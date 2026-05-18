import { describe, expect, it } from "vitest";
import { AuthError } from "@/lib/auth/errors";
import { readJsonBody } from "@/lib/http/json-body";

describe("limited JSON body reader", () => {
  it("parses JSON bodies within the byte limit", async () => {
    const body = await readJsonBody(new Request("https://sentrovia.test", {
      method: "POST",
      body: JSON.stringify({ email: "ops@example.com" }),
    }), 128);

    expect(body).toEqual({ email: "ops@example.com" });
  });

  it("rejects bodies whose content length exceeds the limit", async () => {
    const request = new Request("https://sentrovia.test", {
      method: "POST",
      body: "{}",
      headers: { "content-length": "129" },
    });

    await expect(readJsonBody(request, 128)).rejects.toThrow(AuthError);
  });

  it("rejects streamed bodies that exceed the limit", async () => {
    const request = new Request("https://sentrovia.test", {
      method: "POST",
      body: JSON.stringify({ payload: "x".repeat(128) }),
    });

    await expect(readJsonBody(request, 32)).rejects.toThrow(AuthError);
  });
});
