import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "@/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/auth/token";

describe("authenticated route matcher", () => {
  it("protects the system health page", () => {
    expect(config.matcher).toContain("/system-health/:path*");
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
});
