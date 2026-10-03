import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSessionEndedLoginPath,
  installSessionGuard,
  isSessionEndedResponse,
  markIntentionalSignOut,
} from "@/lib/client/session-guard";

const origin = "https://sentrovia.example";

describe("session guard", () => {
  it("treats a 401 from the app's API as an ended session", () => {
    expect(isSessionEndedResponse("/api/monitors?page=2", 401, origin)).toBe(true);
    expect(isSessionEndedResponse(`${origin}/api/auth/session`, 401, origin)).toBe(true);
  });

  it("ignores other statuses, other origins and non-API paths", () => {
    expect(isSessionEndedResponse("/api/monitors", 403, origin)).toBe(false);
    expect(isSessionEndedResponse("/api/monitors", 200, origin)).toBe(false);
    expect(isSessionEndedResponse("https://hooks.example/api/x", 401, origin)).toBe(false);
    expect(isSessionEndedResponse("/status/acme", 401, origin)).toBe(false);
  });

  it("ignores wrong-password answers from the credential checks", () => {
    expect(isSessionEndedResponse("/api/auth/login", 401, origin)).toBe(false);
    expect(isSessionEndedResponse("/api/auth/change-password", 401, origin)).toBe(false);
    expect(isSessionEndedResponse("/api/auth/onboarding", 401, origin)).toBe(false);
  });

  it("returns to the current page after signing in again", () => {
    expect(buildSessionEndedLoginPath("/monitoring?status=down")).toBe(
      "/login?next=%2Fmonitoring%3Fstatus%3Ddown&message=session-ended"
    );
    expect(buildSessionEndedLoginPath("//evil.example")).toBe("/login?next=%2Fdashboard&message=session-ended");
  });
});

describe("installSessionGuard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubWindow(status: number) {
    const fetchMock = vi.fn(async () => new Response(null, { status }));
    vi.stubGlobal("window", { fetch: fetchMock, location: { origin } });
    return fetchMock;
  }

  it("reports an ended session once and passes every response through", async () => {
    stubWindow(401);
    const onEnded = vi.fn();
    const uninstall = installSessionGuard(onEnded);

    expect((await window.fetch("/api/monitors")).status).toBe(401);
    await window.fetch("/api/companies");

    expect(onEnded).toHaveBeenCalledTimes(1);
    uninstall();
  });

  it("stays quiet after a deliberate sign-out until the next signed-in page", async () => {
    stubWindow(401);
    const onEnded = vi.fn();
    let uninstall = installSessionGuard(onEnded);
    markIntentionalSignOut();
    await window.fetch("/api/monitors");
    expect(onEnded).not.toHaveBeenCalled();
    uninstall();

    uninstall = installSessionGuard(onEnded);
    await window.fetch("/api/monitors");
    expect(onEnded).toHaveBeenCalledTimes(1);
    uninstall();
  });

  it("restores the original fetch when removed", () => {
    const fetchMock = stubWindow(200);
    const uninstall = installSessionGuard(vi.fn());
    expect(window.fetch).not.toBe(fetchMock);
    uninstall();
    expect(window.fetch).toBe(fetchMock);
  });
});
