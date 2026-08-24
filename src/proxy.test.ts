import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "@/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/auth/token";
import { createSessionToken } from "@/lib/auth/token";

describe("authenticated route matcher", () => {
  it("does not expose the retired system health page", () => {
    expect(config.matcher).not.toContain("/system-health/:path*");
  });

  it("clears an invalid session cookie before redirecting to login", async () => {
    const request = new NextRequest("http://10.21.201.111:3000/dashboard", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=invalid-token` },
    });

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://10.21.201.111:3000/login?next=%2Fdashboard",
    );
    expect(response.cookies.get(SESSION_COOKIE_NAME)?.value).toBe("");
  });

  it("blocks read-only viewers from API mutations", async () => {
    const token = await createSessionToken({
      id: "viewer-1",
      firstName: "Read",
      lastName: "Only",
      email: "viewer@example.com",
      department: null,
      role: "viewer",
    });
    const request = new NextRequest("http://localhost/api/monitors", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
    });

    const response = await proxy(request);
    expect(response.status).toBe(403);
  });

  it("allows operators to mutate monitors but not worker state", async () => {
    const token = await createSessionToken({
      id: "operator-1",
      firstName: "Operations",
      lastName: "User",
      email: "operator@example.com",
      department: null,
      role: "operator",
    });
    const cookie = `${SESSION_COOKIE_NAME}=${token}`;

    await expect(proxy(new NextRequest("http://localhost/api/monitors", {
      method: "POST",
      headers: { cookie },
    }))).resolves.toMatchObject({ status: 200 });
    await expect(proxy(new NextRequest("http://localhost/api/worker", {
      method: "POST",
      headers: { cookie },
    }))).resolves.toMatchObject({ status: 403 });
  });

  it("keeps readiness, heartbeat, and metrics endpoints outside cookie authentication", async () => {
    await expect(proxy(new NextRequest("http://localhost/api/health"))).resolves.toMatchObject({ status: 200 });
    await expect(proxy(new NextRequest("http://localhost/api/metrics"))).resolves.toMatchObject({ status: 200 });
    await expect(proxy(new NextRequest("http://localhost/api/monitors/heartbeat/token", { method: "POST" })))
      .resolves.toMatchObject({ status: 200 });
  });
});
