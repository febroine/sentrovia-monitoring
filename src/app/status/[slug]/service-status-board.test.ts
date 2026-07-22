import { describe, expect, it } from "vitest";
import { filterPublicStatusServices } from "./service-status-board";

const services = [
  buildService("down", "https://api.example.com", "İhlas Holding"),
  buildService("pending", "https://slow.example.com", "Operations"),
  buildService("up", "https://portal.example.com", "Operations"),
];

describe("filterPublicStatusServices", () => {
  it("filters by status while preserving the supplied priority order", () => {
    expect(filterPublicStatusServices(services, "", "down").map((service) => service.url)).toEqual([
      "https://api.example.com",
    ]);
  });

  it("searches URLs and company names without case or accent sensitivity", () => {
    expect(filterPublicStatusServices(services, "IHLAS", "all")).toHaveLength(1);
    expect(filterPublicStatusServices(services, "portal", "all")[0]?.status).toBe("up");
  });

  it("combines search and status filters", () => {
    expect(filterPublicStatusServices(services, "operations", "pending")).toHaveLength(1);
    expect(filterPublicStatusServices(services, "operations", "down")).toHaveLength(0);
  });
});

function buildService(status: string, url: string, company: string) {
  return {
    id: `${status}-${url}`,
    url,
    company,
    status,
    uptime: "99.99%",
    latencyMs: 120,
    slowResponseThresholdMs: 1000,
    lastCheckedAt: null,
    healthScore: 95,
    healthLabel: "Healthy",
    hasOpenOutage: status === "down",
    outageStartedAt: null,
  };
}
