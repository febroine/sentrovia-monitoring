import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken, type SessionUser } from "@/lib/auth/token";

const originalAuthSecret = process.env.AUTH_SECRET;
const originalSessionId = process.env.AUTH_SESSION_ID;
const testUser: SessionUser = {
  id: "user-1",
  firstName: "Test",
  lastName: "Admin",
  email: "admin@example.com",
  department: null,
  role: "admin",
};

afterEach(() => {
  restoreEnvironmentValue("AUTH_SECRET", originalAuthSecret);
  restoreEnvironmentValue("AUTH_SESSION_ID", originalSessionId);
});

describe("session deployment binding", () => {
  it("accepts a token from the current deployment", async () => {
    process.env.AUTH_SECRET = "a".repeat(64);
    process.env.AUTH_SESSION_ID = "deployment-one";

    const token = await createSessionToken(testUser, 3);

    await expect(verifySessionToken(token)).resolves.toMatchObject({
      id: testUser.id,
      role: "admin",
      sessionVersion: 3,
    });
  });

  it("rejects a token after the deployment session id changes", async () => {
    process.env.AUTH_SECRET = "a".repeat(64);
    process.env.AUTH_SESSION_ID = "deployment-one";
    const token = await createSessionToken(testUser);

    process.env.AUTH_SESSION_ID = "deployment-two";

    await expect(verifySessionToken(token)).resolves.toBeNull();
  });

  it("rejects legacy tokens that have no deployment session id", async () => {
    const authSecret = "a".repeat(64);
    process.env.AUTH_SECRET = authSecret;
    process.env.AUTH_SESSION_ID = "deployment-one";
    const token = await new SignJWT({ ...testUser, sessionVersion: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(testUser.id)
      .setIssuer("sentrovia-auth")
      .setAudience("sentrovia-session")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(authSecret));

    await expect(verifySessionToken(token)).resolves.toBeNull();
  });
});

function restoreEnvironmentValue(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
