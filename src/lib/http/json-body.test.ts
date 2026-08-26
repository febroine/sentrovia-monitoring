import { describe, expect, it } from "vitest";
import { AuthError } from "@/lib/auth/errors";
import { readJsonBody } from "@/lib/http/json-body";

describe("limited JSON body reader", () => {
  it("parses JSON bodies within the byte limit", async () => {
    const body = await readJsonBody(new Request("https://sentrovia.test", {
      method: "POST",
      body: JSON.stringify({ email: "ops@example.com" }),
      headers: { "content-type": "application/json" },
    }), 128);

    expect(body).toEqual({ email: "ops@example.com" });
  });

  it("rejects bodies whose content length exceeds the limit", async () => {
    const request = new Request("https://sentrovia.test", {
      method: "POST",
      body: "{}",
      headers: { "content-length": "129", "content-type": "application/json" },
    });

    await expect(readJsonBody(request, 128)).rejects.toThrow(AuthError);
  });

  it("rejects streamed bodies that exceed the limit", async () => {
    const request = new Request("https://sentrovia.test", {
      method: "POST",
      body: JSON.stringify({ payload: "x".repeat(128) }),
      headers: { "content-type": "application/json" },
    });

    await expect(readJsonBody(request, 32)).rejects.toThrow(AuthError);
  });

  it("rejects simple cross-site content types", async () => {
    const request = new Request("https://sentrovia.test/api/settings", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "text/plain" },
    });

    await expect(readJsonBody(request, 128)).rejects.toMatchObject({ status: 415 });
  });

  it("rejects a mismatched browser origin", async () => {
    const request = new Request("https://sentrovia.test/api/settings", {
      method: "POST",
      body: "{}",
      headers: {
        "content-type": "application/json",
        host: "sentrovia.test",
        origin: "https://attacker.sentrovia.test",
        "sec-fetch-site": "same-site",
      },
    });

    await expect(readJsonBody(request, 128)).rejects.toMatchObject({ status: 403 });
  });

  it("allows a LAN origin that matches the direct request host", async () => {
    const request = new Request("http://localhost:3000/api/settings", {
      method: "POST",
      body: "{}",
      headers: {
        "content-type": "application/json",
        host: "192.168.1.50:3000",
        origin: "http://192.168.1.50:3000",
        "sec-fetch-site": "same-origin",
      },
    });

    await expect(readJsonBody(request, 128)).resolves.toEqual({});
  });
});
